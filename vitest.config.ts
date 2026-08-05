import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@marctco/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url)),
      "@marctco/db": fileURLToPath(new URL("./packages/db/src/index.ts", import.meta.url))
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "domain",
          include: [
          "packages/domain/src/**/*.test.ts",
          "apps/worker/src/**/*.test.ts",
          "apps/web/**/*.test.ts",
          "packages/db/src/access-context.test.ts"
          ]
        }
      },
      {
        extends: true,
        test: {
          name: "db",
          include: [
            "packages/db/src/foundation-recovery.test.ts",
            "packages/db/src/integration-connection.test.ts",
            "packages/db/src/runtime-database-url.test.ts",
            "packages/db/src/workspace-context.test.ts",
            "packages/db/tests/{boot-check,rls}.test.ts"
          ],
          fileParallelism: false
        }
      },
      {
        extends: true,
        test: {
          name: "a7",
          include: ["packages/db/tests/a7.test.ts"],
          fileParallelism: false
        }
      },
      {
        extends: true,
        test: {
          name: "managed-migration",
          include: ["packages/db/tests/managed-migration.test.ts"],
          fileParallelism: false
        }
      }
    ]
  }
});
