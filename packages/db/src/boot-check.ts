import { createPrismaClient } from "./client.js";
import type { RuntimeDatabaseEndpoint } from "./runtime-database-url.js";
import {
  formatRuntimeDatabaseEndpoint,
  inspectRuntimeDatabaseUrl,
  redactRuntimeDatabaseSecrets
} from "./runtime-database-url.js";

interface DatabaseRoleRow {
  role_name: string;
  is_superuser: boolean;
  bypasses_rls: boolean;
  owned_business_tables: bigint;
}

interface AssertSafeDatabaseRoleOptions {
  process_name: "web" | "worker";
  database_url?: string;
}

function describeCause(cause: unknown, database_url: string): string {
  const record = cause as { code?: unknown; errorCode?: unknown; message?: unknown };
  const code = [record?.code, record?.errorCode].find((value) => typeof value === "string");
  const reason = typeof record?.message === "string" ? record.message : String(cause);
  return `${code === undefined ? "" : ` code=${code}`} :: ${redactRuntimeDatabaseSecrets(
    reason.replace(/\s+/g, " ").trim(),
    database_url
  )}`;
}

export async function assertSafeDatabaseRole(
  options: AssertSafeDatabaseRoleOptions
): Promise<void> {
  const database_url = options.database_url ?? process.env.DATABASE_URL;
  if (!database_url) {
    throw new Error(`${options.process_name}: DATABASE_URL is required to verify the database role`);
  }
  const endpoint: RuntimeDatabaseEndpoint = inspectRuntimeDatabaseUrl(
    database_url,
    options.process_name
  );

  const client = createPrismaClient(options.database_url);
  try {
    let rows: DatabaseRoleRow[];
    try {
      rows = await client.$queryRaw<DatabaseRoleRow[]>`
        SELECT
          current_user::text AS role_name,
          role.rolsuper AS is_superuser,
          role.rolbypassrls AS bypasses_rls,
          (
            SELECT COUNT(*)
            FROM pg_tables
            WHERE schemaname = 'public'
              AND tablename <> '_prisma_migrations'
              AND tableowner = current_user
          ) AS owned_business_tables
        FROM pg_roles AS role
        WHERE role.rolname = current_user
      `;
    } catch (cause: unknown) {
      throw new Error(
        `${options.process_name}: database connection failed ` +
          `(${formatRuntimeDatabaseEndpoint(endpoint)})${describeCause(cause, database_url)}`
      );
    }
    const role = rows[0];
    if (!role) {
      throw new Error(`${options.process_name}: connected database role could not be inspected`);
    }

    const failures: string[] = [];
    if (role.is_superuser) {
      failures.push("is superuser");
    }
    if (role.bypasses_rls) {
      failures.push("has BYPASSRLS");
    }
    if (role.owned_business_tables > 0n) {
      failures.push(`owns ${role.owned_business_tables.toString()} business table(s)`);
    }

    if (failures.length > 0) {
      throw new Error(
        `${options.process_name}: refusing to boot with database role ${role.role_name}: ${failures.join(
          ", "
        )}`
      );
    }
  } finally {
    await client.$disconnect();
  }
}

