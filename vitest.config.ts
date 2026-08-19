import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

/**
 * Seam 2 exercises the real ingestion path, so the application code must run
 * without the RLS bypass a superuser connection carries. Rather than a second
 * set of credentials, the same URL is reused with a startup `role` option: the
 * session becomes marctco_app, and the policies apply exactly as in production.
 */
function appRoleDatabaseUrl(database_url: string): string {
  const url = new URL(database_url);
  url.searchParams.set("options", "-c role=marctco_app");
  return url.toString();
}

export default defineConfig({
  // apps/web keeps `jsx: "preserve"` for Next's own compiler; Vitest has no
  // compiler after it, so it needs the runtime transform spelled out here.
  esbuild: { jsx: "automatic" },
  resolve: {
    alias: {
      "@marctco/domain/feature-flags": fileURLToPath(
        new URL("./packages/domain/src/feature-flags.ts", import.meta.url)
      ),
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
            "packages/db/src/provision-workspace.test.ts",
            "packages/db/src/runtime-database-url.test.ts",
            "packages/db/src/workspace-context.test.ts",
            "packages/db/tests/{activities,agenda,boot-check,feature-flags,first-contact,intake,intake-review-resolution,integration-connection-operations,lead-board,leads,lead-timeline,movement,outbox-recovery,person-candidates,quarantine,rls,team,team-membership-lifecycle,workspace-settings}.test.ts"
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
          name: "seam2",
          include: ["tests/seam2-*.test.ts"],
          fileParallelism: false,
          testTimeout: 40_000,
          hookTimeout: 40_000,
          env: {
            DATABASE_URL: appRoleDatabaseUrl(process.env.DATABASE_URL ?? "postgresql://localhost"),
            SEAM2_ADMIN_DATABASE_URL: process.env.DATABASE_URL ?? ""
          }
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
