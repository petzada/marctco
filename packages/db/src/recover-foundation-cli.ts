import { spawnSync } from "node:child_process";
import { createPrismaClient } from "./client.js";
import {
  decideMigrationRecovery,
  type AuthWorkspaceArtifacts,
  type FailedMigrationState,
  type FoundationArtifacts
} from "./foundation-recovery.js";

if (process.env.ALLOW_FOUNDATION_RECOVERY !== "true") {
  throw new Error("Migration recovery requires ALLOW_FOUNDATION_RECOVERY=true in the release job");
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
  const foundation_rows = await client.$queryRaw<FoundationArtifacts[]>`
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
  const auth_rows = await client.$queryRaw<AuthWorkspaceArtifacts[]>`
    SELECT
      EXISTS(SELECT 1 FROM pg_roles WHERE rolname = 'marctco_private_definer') AS private_definer_role_exists,
      EXISTS(
        SELECT 1
        FROM pg_auth_members AS member
        INNER JOIN pg_roles AS role ON role.oid = member.roleid
        INNER JOIN pg_roles AS member_role ON member_role.oid = member.member
        WHERE role.rolname = 'marctco_private_definer'
          AND member_role.rolname = 'marctco_migrator'
      ) AS migrator_private_definer_membership,
      EXISTS(
        SELECT 1
        FROM pg_proc AS proc
        INNER JOIN pg_namespace AS namespace ON namespace.oid = proc.pronamespace
        WHERE namespace.nspname = 'private'
          AND proc.proname = 'resolve_user_workspaces'
      ) AS resolve_user_workspaces_exists,
      ARRAY(
        SELECT policyname::text
        FROM pg_policies
        WHERE policyname IN (
          'workspaces_private_definer_select',
          'workspace_members_private_definer_select'
        )
        ORDER BY policyname
      ) AS definer_policies
  `;
  const foundationArtifacts = foundation_rows[0] ?? {
    roles: [],
    schemas: [],
    types: [],
    tables: []
  };
  const authArtifacts = auth_rows[0] ?? {
    private_definer_role_exists: false,
    migrator_private_definer_membership: false,
    resolve_user_workspaces_exists: false,
    definer_policies: []
  };
  decision = decideMigrationRecovery(
    { history_table_exists, migrations, artifacts: foundationArtifacts },
    { history_table_exists, migrations, artifacts: authArtifacts }
  );
} finally {
  await client.$disconnect();
}

if (decision.action === "abort") {
  throw new Error(`Migration recovery refused: ${decision.reason}`);
}
if (decision.action === "none") {
  console.log(`Migration recovery not needed: ${decision.reason}`);
  process.exit(0);
}

console.log(
  "Migration recovery audit proved a failed history row with no residual artifacts"
);
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
  throw new Error("Prisma refused to mark the transactionally clean migration attempt rolled back");
}
