import { defineConfig } from "vitest/config";

export default defineConfig({
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
