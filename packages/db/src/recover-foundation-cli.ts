import { spawnSync } from "node:child_process";
import { createPrismaClient } from "./client.js";
import {
  decideFoundationRecovery,
  type FailedMigrationState,
  type FoundationArtifacts
} from "./foundation-recovery.js";

if (process.env.ALLOW_FOUNDATION_RECOVERY !== "true") {
  throw new Error("Foundation recovery requires ALLOW_FOUNDATION_RECOVERY=true in the release job");
}

const client = createPrismaClient();
let decision;
try {
  const history = await client.$queryRaw<Array<{ history_table_exists: boolean }>>`
    SELECT to_regclass('public._prisma_migrations') IS NOT NULL AS history_table_exists
  `;
  const history_table_exists = history[0]?.history_table_exists ?? false;
  const migrations = history_table_exists
    ? await client.$queryRaw<FailedMigrationState[]>`
        SELECT migration_name, finished_at, rolled_back_at, logs
        FROM public._prisma_migrations
        ORDER BY started_at
      `
    : [];
  const artifact_rows = await client.$queryRaw<FoundationArtifacts[]>`
    SELECT
      ARRAY(SELECT rolname::text FROM pg_roles WHERE rolname LIKE 'marctco_%' ORDER BY rolname) AS roles,
      ARRAY(SELECT nspname::text FROM pg_namespace WHERE nspname = 'private') AS schemas,
      ARRAY(SELECT typname::text FROM pg_type WHERE typname = 'workspace_role') AS types,
      ARRAY(
        SELECT (schemaname || '.' || tablename)::text
        FROM pg_tables
        WHERE schemaname = 'public'
          AND tablename IN ('workspaces', 'workspace_members')
        ORDER BY tablename
      ) AS tables
  `;
  const artifacts = artifact_rows[0] ?? { roles: [], schemas: [], types: [], tables: [] };
  decision = decideFoundationRecovery({ history_table_exists, migrations, artifacts });
} finally {
  await client.$disconnect();
}

if (decision.action === "abort") {
  throw new Error(`Foundation recovery refused: ${decision.reason}`);
}
if (decision.action === "none") {
  console.log(`Foundation recovery not needed: ${decision.reason}`);
  process.exit(0);
}

console.log("Foundation recovery audit proved a failed history row with no residual artifacts");
const pnpm = process.env.npm_execpath;
if (!pnpm) {
  throw new Error("pnpm executable path is unavailable");
}
const result = spawnSync(
  process.execPath,
  [
    pnpm,
    "--filter",
    "@marctco/db",
    "exec",
    "prisma",
    "migrate",
    "resolve",
    "--rolled-back",
    decision.migration_name
  ],
  { stdio: "inherit", env: process.env }
);
if (result.error) {
  throw result.error;
}
if (result.status !== 0) {
  throw new Error("Prisma refused to mark the transactionally clean foundation attempt rolled back");
}
