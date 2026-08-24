import eslint from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

const typedConfigs = tseslint.configs.recommendedTypeChecked.map((config) => ({
  ...config,
  files: ["**/*.ts", "**/*.tsx"]
}));

export default tseslint.config(
  {
    ignores: [
      ".claude/**",
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/coverage/**",
      "packages/db/generated/**"
    ]
  },
  eslint.configs.recommended,
  {
    files: ["**/*.mjs"],
    languageOptions: {
      globals: globals.node
    }
  },
  ...typedConfigs,
  {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: {
        ...globals.node,
        ...globals.browser
      },
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": "error",
      "@typescript-eslint/no-import-type-side-effects": "error"
    }
  },
  {
    files: ["apps/**/*.ts", "apps/**/*.tsx", "packages/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": [
                "@prisma/client",
                "@marctco/db/src/*",
                "**/packages/db/src/client*",
                "**/packages/db/src/internal/*"
              ],
              "message": "Prisma Client is internal to packages/db; import a named database operation instead."
            }
          ]
        }
      ]
    }
  },
  {
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          "patterns": [
            {
              "group": [
                "@prisma/client",
                "@marctco/db/src/*",
                "**/packages/db/src/client*",
                "**/packages/db/src/internal/*"
              ],
              "message": "Prisma Client is internal to packages/db; import a named database operation instead."
            },
            {
              "group": ["@marctco/domain/feature-flags"],
              "message":
                "The feature catalog is server-only roadmap data. Web code receives a resolved workspace boolean from a named @marctco/db operation."
            }
          ]
        }
      ]
    }
  },
  {
    // ADR-0006 regra 11: apps/web and apps/worker are each a single Node
    // process serving requests/jobs for every tenant. A mutable value at
    // module scope (resolved workspace, role, flag) leaks tenant A's
    // result into tenant B's request — RLS cannot catch this, because the
    // read was legitimate and scoped correctly; what leaks happens after
    // the database, inside the process. `const` is still allowed (a
    // module-level PrismaClient or logger instance is infrastructure, not
    // tenant data), which is why this bans `let`/`var` at module scope
    // rather than banning top-level declarations outright.
    files: ["apps/web/**/*.ts", "apps/web/**/*.tsx", "apps/worker/**/*.ts"],
    ignores: ["**/*.test.ts", "**/*.test.tsx"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector: "Program > VariableDeclaration[kind!='const']",
          message:
            "No mutable module-scope state in apps/web or apps/worker (ADR-0006 regra 11): a workspace, role or flag value must never live in a singleton or a cache without a workspace key. Use const, or move the value inside a request/job scope."
        }
      ]
    }
  }
);
