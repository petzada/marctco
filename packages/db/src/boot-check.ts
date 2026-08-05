import { createPrismaClient } from "./client.js";

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

export async function assertSafeDatabaseRole(
  options: AssertSafeDatabaseRoleOptions
): Promise<void> {
  const client = createPrismaClient(options.database_url);
  try {
    const rows = await client.$queryRaw<DatabaseRoleRow[]>`
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

