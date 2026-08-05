import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobContext, createUserContext, type AccessContext } from "../src/access-context.js";
import { withAccessContext } from "../src/internal/scoped-transaction.js";

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

  it("keeps the private schema unreachable to the worker role", async () => {
    const privileges = await client.$queryRaw<Array<{ can_use: boolean }>>`
      SELECT has_schema_privilege('marctco_worker', 'private', 'USAGE') AS can_use
    `;
    expect(privileges).toEqual([{ can_use: false }]);
  });

  it("catches a business table created without RLS or policy — verified deliberately", async () => {
    const probe_table = "rls_seam3_probe_no_policy";
    await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_migrator");
      await transaction.$executeRawUnsafe(
        `CREATE TABLE ${probe_table} (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL)`
      );

      const rows = await transaction.$queryRaw<
        Array<{ enabled: boolean; forced: boolean; policy_count: bigint }>
      >`
        SELECT
          class.relrowsecurity AS enabled,
          class.relforcerowsecurity AS forced,
          COUNT(policies.policyname) AS policy_count
        FROM pg_class AS class
        JOIN pg_namespace AS namespace
          ON namespace.oid = class.relnamespace AND namespace.nspname = 'public'
        LEFT JOIN pg_policies AS policies
          ON policies.schemaname = 'public' AND policies.tablename = class.relname
        WHERE class.relname = ${probe_table}
        GROUP BY class.relrowsecurity, class.relforcerowsecurity
      `;
      // Same scan the first test in this file runs across every business table.
      // A table that forgets RLS shows up exactly like this — enabled/forced
      // both false, zero policies — which is what makes that scan an
      // automatic CI gate instead of something a reviewer has to remember.
      expect(rows).toEqual([{ enabled: false, forced: false, policy_count: 0n }]);

      await transaction.$executeRawUnsafe(`DROP TABLE ${probe_table}`);
    });
  });

  it("generically catches an active row that still points at a merged/tombstoned row — verified deliberately", async () => {
    const target_table = "rls_seam3_probe_target";
    const referencing_table = "rls_seam3_probe_referencing";
    await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_migrator");
      // No table in this ticket has a merge tombstone yet (Person and
      // Opportunity land in later tickets). This synthesizes the shape —
      // a self-referencing "merged_into_<x>_id" column, per ADR-0005 — so
      // the generic scan below is proven against a real violation instead
      // of trivially passing because it found nothing to check.
      await transaction.$executeRawUnsafe(`
        CREATE TABLE ${target_table} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          merged_into_probe_target_id uuid REFERENCES ${target_table}(id)
        )
      `);
      await transaction.$executeRawUnsafe(`
        CREATE TABLE ${referencing_table} (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          probe_target_id uuid NOT NULL REFERENCES ${target_table}(id)
        )
      `);

      const canonical = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO ${target_table} (id) VALUES (gen_random_uuid()) RETURNING id`
      );
      const canonical_id = canonical[0]?.id;
      if (!canonical_id) {
        throw new Error("failed to seed the canonical probe row");
      }
      const merged = await transaction.$queryRawUnsafe<Array<{ id: string }>>(
        `INSERT INTO ${target_table} (id, merged_into_probe_target_id)
         VALUES (gen_random_uuid(), '${canonical_id}') RETURNING id`
      );
      const merged_id = merged[0]?.id;
      if (!merged_id) {
        throw new Error("failed to seed the merged probe row");
      }
      // An active row pointing at the row that was just merged away — the
      // exact shape the invariant forbids.
      await transaction.$executeRawUnsafe(
        `INSERT INTO ${referencing_table} (probe_target_id) VALUES ('${merged_id}')`
      );

      // Step 1: discover every self-referencing "merged_into_*" tombstone
      // column in the schema. This is what makes the scan automatic — a
      // future Person.merged_into_person_id needs no change here.
      const merge_pointers = await transaction.$queryRaw<
        Array<{ table_name: string; merge_column: string }>
      >`
        SELECT DISTINCT
          tc.table_name::text AS table_name,
          kcu.column_name::text AS merge_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        WHERE tc.constraint_type = 'FOREIGN KEY'
          AND tc.table_schema = 'public'
          AND kcu.column_name LIKE 'merged\_into\_%' ESCAPE '\'
          AND ccu.table_name = tc.table_name
      `;
      expect(merge_pointers).toEqual([
        { table_name: target_table, merge_column: "merged_into_probe_target_id" }
      ]);

      // Step 2: every foreign key in the schema that targets one of those
      // tables is a place an active row could be pointing at a tombstone.
      const referencing_foreign_keys = await transaction.$queryRaw<
        Array<{
          referencing_table: string;
          referencing_column: string;
          target_table: string;
          target_column: string;
          merge_column: string;
        }>
      >`
        WITH merge_pointers AS (
          SELECT DISTINCT
            tc.table_name::text AS table_name,
            kcu.column_name::text AS merge_column
          FROM information_schema.table_constraints AS tc
          JOIN information_schema.key_column_usage AS kcu
            ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
          JOIN information_schema.constraint_column_usage AS ccu
            ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
          WHERE tc.constraint_type = 'FOREIGN KEY'
            AND tc.table_schema = 'public'
            AND kcu.column_name LIKE 'merged\_into\_%' ESCAPE '\'
            AND ccu.table_name = tc.table_name
        )
        SELECT
          tc.table_name::text AS referencing_table,
          kcu.column_name::text AS referencing_column,
          ccu.table_name::text AS target_table,
          ccu.column_name::text AS target_column,
          merge_pointers.merge_column::text AS merge_column
        FROM information_schema.table_constraints AS tc
        JOIN information_schema.key_column_usage AS kcu
          ON kcu.constraint_name = tc.constraint_name AND kcu.table_schema = tc.table_schema
        JOIN information_schema.constraint_column_usage AS ccu
          ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
        JOIN merge_pointers ON merge_pointers.table_name = ccu.table_name
        WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'
      `;

      let violations = 0;
      for (const fk of referencing_foreign_keys) {
        const rows = await transaction.$queryRawUnsafe<Array<{ violations: bigint }>>(`
          SELECT COUNT(*) AS violations
          FROM "${fk.referencing_table}" AS referencing
          JOIN "${fk.target_table}" AS target
            ON referencing."${fk.referencing_column}" = target."${fk.target_column}"
          WHERE target."${fk.merge_column}" IS NOT NULL
        `);
        violations += Number(rows[0]?.violations ?? 0n);
      }

      // The synthetic referencing row proves the scan finds a real
      // violation, not just that it found nothing to check.
      expect(violations).toBe(1);

      await transaction.$executeRawUnsafe(`DROP TABLE ${referencing_table}`);
      await transaction.$executeRawUnsafe(`DROP TABLE ${target_table}`);
    });
  });
});

describe("Seam 3: withAccessContext is the single production path to data (ADR-0016)", () => {
  it("scopes a UserContext read to its own workspace, under the app role", async () => {
    const user_context = createUserContext({
      workspace_id: workspace_a,
      user_id: randomUUID(),
      role: "OWNER"
    });

    const visible = await withAccessContext(client, user_context, async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
      return transaction.$queryRaw<Array<{ workspace_id: string }>>`
        SELECT workspace_id FROM workspace_members ORDER BY workspace_id
      `;
    });

    expect(visible).toEqual([{ workspace_id: workspace_a }]);
  });

  it("scopes a JobContext read to its own workspace, under the worker role", async () => {
    const job_context = createJobContext({
      workspace_id: workspace_b,
      integration_event_id: randomUUID()
    });

    const visible = await withAccessContext(client, job_context, async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_worker");
      return transaction.$queryRaw<Array<{ workspace_id: string }>>`
        SELECT workspace_id FROM workspace_members ORDER BY workspace_id
      `;
    });

    expect(visible).toEqual([{ workspace_id: workspace_b }]);
  });

  it("uses SET LOCAL, not SET: the workspace claim never survives past the transaction", async () => {
    const user_context = createUserContext({
      workspace_id: workspace_a,
      user_id: randomUUID(),
      role: "OWNER"
    });

    await withAccessContext(client, user_context, async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
      await transaction.$queryRaw`SELECT 1`;
    });

    const after = await client.$queryRaw<Array<{ workspace_id: string }>>`
      SELECT current_setting('app.workspace_id', true)::text AS workspace_id
    `;
    expect(after).toEqual([{ workspace_id: "" }]);
  });

  it("fails closed and never opens the transaction for an unknown role, even past the constructor", async () => {
    // createUserContext already refuses this; this proves the helper itself
    // does not silently trust a context that reached it some other way.
    const corrupted_context = {
      kind: "user",
      workspace_id: workspace_a,
      user_id: randomUUID(),
      role: "ADMIN"
    } as unknown as AccessContext;

    let work_ran = false;
    await expect(
      withAccessContext(client, corrupted_context, () => {
        work_ran = true;
        return Promise.resolve();
      })
    ).rejects.toThrow(/unknown role/i);
    expect(work_ran).toBe(false);
  });

  it("refuses a non-UUID workspace_id before touching the database", async () => {
    const corrupted_context = {
      kind: "job",
      workspace_id: "not-a-uuid",
      integration_event_id: randomUUID()
    } as unknown as AccessContext;

    let work_ran = false;
    await expect(
      withAccessContext(client, corrupted_context, () => {
        work_ran = true;
        return Promise.resolve();
      })
    ).rejects.toThrow(/must be a UUID/i);
    expect(work_ran).toBe(false);
  });
});
