import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@marctco/domain": fileURLToPath(new URL("./packages/domain/src/index.ts", import.meta.url))
    }
  },
  test: {
    projects: [
      {
        extends: true,
        test: {
          name: "domain",
          include: ["packages/domain/src/**/*.test.ts", "apps/worker/src/**/*.test.ts"]
        }
      },
      {
        extends: true,
        test: {
          name: "db",
          include: ["packages/db/tests/{boot-check,rls}.test.ts"],
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
      }
    ]
  }
});
