import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

const client = new PrismaClient({ datasources: { db: { url: database_url } } });
const workspace_a = randomUUID();
const workspace_b = randomUUID();
const isolation_cases = [
  {
    table_name: "workspace_members",
    read_sql:
      "SELECT workspace_id AS tenant_id FROM workspace_members ORDER BY workspace_id",
    write_sql: `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('${workspace_b}', '${randomUUID()}', 'ATTENDANT')`
  },
  {
    table_name: "workspaces",
    read_sql: "SELECT id AS tenant_id FROM workspaces ORDER BY id",
    write_sql: `INSERT INTO workspaces (id, slug, name, updated_at) VALUES ('${randomUUID()}', '${randomUUID()}', 'Cross-workspace', CURRENT_TIMESTAMP)`
  }
] as const;

beforeAll(async () => {
  await client.workspace.createMany({
    data: [
      { id: workspace_a, slug: randomUUID(), name: "Workspace A" },
      { id: workspace_b, slug: randomUUID(), name: "Workspace B" }
    ]
  });
  await client.workspaceMember.createMany({
    data: [
      { workspace_id: workspace_a, user_id: randomUUID(), role: "ATTENDANT" },
      { workspace_id: workspace_b, user_id: randomUUID(), role: "ATTENDANT" }
    ]
  });
});

afterAll(async () => {
  await client.workspaceMember.deleteMany({
    where: { workspace_id: { in: [workspace_a, workspace_b] } }
  });
  await client.workspace.deleteMany({ where: { id: { in: [workspace_a, workspace_b] } } });
  await client.$disconnect();
});

describe("Seam 3: RLS and schema invariants", () => {
  it("requires RLS enabled, forced and a policy on every business table", async () => {
    const rows = await client.$queryRaw<
      Array<{ table_name: string; enabled: boolean; forced: boolean; policy_count: bigint }>
    >`
      SELECT
        tables.tablename::text AS table_name,
        class.relrowsecurity AS enabled,
        class.relforcerowsecurity AS forced,
        COUNT(policies.policyname) AS policy_count
      FROM pg_tables AS tables
      JOIN pg_class AS class ON class.oid = (quote_ident(tables.schemaname) || '.' || quote_ident(tables.tablename))::regclass
      LEFT JOIN pg_policies AS policies
        ON policies.schemaname = tables.schemaname
       AND policies.tablename = tables.tablename
      WHERE tables.schemaname = 'public'
        AND tables.tablename <> '_prisma_migrations'
      GROUP BY tables.tablename, class.relrowsecurity, class.relforcerowsecurity
      ORDER BY tables.tablename
    `;

    expect(rows.map((row) => row.table_name)).toEqual(["workspace_members", "workspaces"]);
    expect(isolation_cases.map((test_case) => test_case.table_name)).toEqual(
      rows.map((row) => row.table_name)
    );
    for (const row of rows) {
      expect(row.enabled, row.table_name).toBe(true);
      expect(row.forced, row.table_name).toBe(true);
      expect(row.policy_count, row.table_name).toBeGreaterThan(0n);
    }
  });

  it.each(isolation_cases)(
    "$table_name returns no cross-workspace rows and refuses a cross-workspace insert",
    async ({ read_sql, write_sql }) => {
      const visible = await client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
        await transaction.$executeRawUnsafe(`SET LOCAL app.workspace_id = '${workspace_a}'`);
        return transaction.$queryRawUnsafe<Array<{ tenant_id: string }>>(read_sql);
      });
      expect(visible).toEqual([{ tenant_id: workspace_a }]);

      await expect(
        client.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
          await transaction.$executeRawUnsafe(`SET LOCAL app.workspace_id = '${workspace_a}'`);
          await transaction.$executeRawUnsafe(write_sql);
        })
      ).rejects.toThrow(/row-level security policy/i);
    }
  );

  it("keeps runtime roles non-privileged and business tables owned by the migrator", async () => {
    const roles = await client.$queryRaw<
      Array<{ role_name: string; is_superuser: boolean; bypasses_rls: boolean }>
    >`
      SELECT rolname::text AS role_name, rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
      FROM pg_roles
      WHERE rolname IN ('marctco_app', 'marctco_worker')
      ORDER BY rolname
    `;
    expect(roles).toEqual([
      { role_name: "marctco_app", is_superuser: false, bypasses_rls: false },
      { role_name: "marctco_worker", is_superuser: false, bypasses_rls: false }
    ]);

    const owners = await client.$queryRaw<Array<{ table_name: string; owner_name: string }>>`
      SELECT tablename::text AS table_name, tableowner::text AS owner_name
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename
    `;
    expect(owners.every((row) => row.owner_name === "marctco_migrator")).toBe(true);
  });

  it("allows SECURITY DEFINER only in private and only for the three declared names", async () => {
    const functions = await client.$queryRaw<
      Array<{ schema_name: string; function_name: string }>
    >`
      SELECT namespace.nspname::text AS schema_name, procedure.proname::text AS function_name
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE procedure.prosecdef
        AND namespace.nspname <> 'information_schema'
        AND namespace.nspname <> 'pg_catalog'
        AND namespace.nspname NOT LIKE 'pg_toast%'
      ORDER BY namespace.nspname, procedure.proname
    `;
    const allowed = new Set([
      "private.claim_pending_events",
      "private.provision_workspace",
      "private.resolve_workspace_by_token_hash"
    ]);
    const function_names = functions.map((row) => `${row.schema_name}.${row.function_name}`);
    expect(new Set(function_names).size, "SECURITY DEFINER overloads are forbidden").toBe(
      function_names.length
    );
    expect(
      function_names.filter((function_name) => !allowed.has(function_name))
    ).toEqual([]);
  });

  it("has an index whose leading column scopes every business table by workspace", async () => {
    const rows = await client.$queryRaw<Array<{ table_name: string; indexed: boolean }>>`
      SELECT
        tables.tablename::text AS table_name,
        EXISTS (
          SELECT 1
          FROM pg_index AS index
          JOIN pg_attribute AS attribute
            ON attribute.attrelid = index.indrelid
           AND attribute.attnum = index.indkey[0]
          WHERE index.indrelid = (quote_ident(tables.schemaname) || '.' || quote_ident(tables.tablename))::regclass
            AND attribute.attname = CASE WHEN tables.tablename = 'workspaces' THEN 'id' ELSE 'workspace_id' END
        ) AS indexed
      FROM pg_tables AS tables
      WHERE tables.schemaname = 'public' AND tables.tablename <> '_prisma_migrations'
      ORDER BY tables.tablename
    `;
    expect(rows.every((row) => row.indexed)).toBe(true);
  });
});
