import { createHash, randomUUID } from "node:crypto";
import { defaultCommercialPipeline } from "@marctco/domain";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { provisionWorkspace } from "../src/provision-workspace.js";
import { createJobContext, type AccessContext, type UserContext } from "../src/access-context.js";
import { withAccessContext } from "../src/internal/scoped-transaction.js";
import {
  deletePipeline,
  deleteStage,
  reorderStages,
  replaceStageRoles
} from "../src/pipeline-operations.js";
import { listUserWorkspaces, resolveUserContextForSlug } from "../src/workspace-context.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

const client = new PrismaClient({ datasources: { db: { url: database_url } } });
const workspace_a = randomUUID();
const workspace_b = randomUUID();
const workspace_slug_a = randomUUID();
const workspace_slug_b = randomUUID();
const user_a = randomUUID();
const user_b = randomUUID();
const tag_a = randomUUID();
const tag_b = randomUUID();
const tag_b_unapplied = randomUUID();
const pipeline_a = randomUUID();
const pipeline_b = randomUUID();
const stage_a_entry = randomUUID();
const stage_a_closing = randomUUID();
const stage_b_entry = randomUUID();
const stage_b_closing = randomUUID();
const integration_connection_a = randomUUID();
const integration_connection_b = randomUUID();
const person_a = randomUUID();
const person_b = randomUUID();
const merged_person_a = randomUUID();
const integration_event_a = randomUUID();
const integration_event_b = randomUUID();
const opportunity_a = randomUUID();
const opportunity_b = randomUUID();
const lead_submission_a = randomUUID();
const lead_submission_b = randomUUID();
// Workspace A's card lives on a pipeline of its own, because the pipeline
// operations below delete `pipeline_a` and a pipeline holding cards is not
// deletable — `opportunities.pipeline_id` is RESTRICT, so a funnel cannot be
// dropped out from under a lead somebody is working.
const carded_pipeline_a = randomUUID();
const carded_stage_a = randomUUID();
const active_token_a = "mtco_rls_active_token_a";
const active_token_b = "mtco_rls_active_token_b";
const token_hash_a = createHash("sha256").update(active_token_a, "utf8").digest("hex");
const token_hash_b = createHash("sha256").update(active_token_b, "utf8").digest("hex");
const cross_workspace_token_hash = createHash("sha256")
  .update(`mtco_cross_workspace_${randomUUID()}`, "utf8")
  .digest("hex");
let user_context_a: UserContext;
const provisioned_workspace_ids: string[] = [];
const isolation_cases = [
  {
    table_name: "intake_reviews",
    read_sql: "SELECT workspace_id AS tenant_id FROM intake_reviews ORDER BY workspace_id",
    write_sql: `INSERT INTO intake_reviews (id, workspace_id, opportunity_id, type, candidate_person_ids) VALUES ('${randomUUID()}', '${workspace_b}', '${opportunity_b}', 'IDENTITY_CONFLICT', ARRAY['${person_b}']::uuid[])`
  },
  {
    table_name: "integration_connections",
    read_sql:
      "SELECT workspace_id AS tenant_id FROM integration_connections ORDER BY workspace_id",
    write_sql: `INSERT INTO integration_connections (id, workspace_id, provider, contract_version, token_hash, token_last4, status, updated_at) VALUES ('${randomUUID()}', '${workspace_b}', 'LANDING_PAGE', 'v1', '${cross_workspace_token_hash}', 'rker', 'ACTIVE', CURRENT_TIMESTAMP)`
  },
  {
    table_name: "integration_events",
    read_sql:
      "SELECT workspace_id AS tenant_id FROM integration_events ORDER BY workspace_id",
    write_sql: `INSERT INTO integration_events (id, workspace_id, integration_connection_id, raw, updated_at) VALUES ('${randomUUID()}', '${workspace_b}', '${integration_connection_b}', '{"nome":"Cross-workspace"}'::jsonb, CURRENT_TIMESTAMP)`
  },
  {
    table_name: "lead_submissions",
    read_sql: "SELECT workspace_id AS tenant_id FROM lead_submissions ORDER BY workspace_id",
    write_sql: `INSERT INTO lead_submissions (id, workspace_id, source, external_lead_id, last_integration_event_id, updated_at) VALUES ('${randomUUID()}', '${workspace_b}', 'META_LEAD_ADS', 'cross-workspace', '${integration_event_b}', CURRENT_TIMESTAMP)`
  },
  {
    table_name: "member_tags",
    read_sql: "SELECT workspace_id AS tenant_id FROM member_tags ORDER BY workspace_id",
    write_sql: `INSERT INTO member_tags (workspace_id, user_id, tag_id) VALUES ('${workspace_b}', '${user_b}', '${tag_b_unapplied}')`
  },
  {
    table_name: "opportunities",
    read_sql: "SELECT workspace_id AS tenant_id FROM opportunities ORDER BY workspace_id",
    write_sql: `INSERT INTO opportunities (id, workspace_id, person_id, pipeline_id, stage_id, area, arrived_at, updated_at) VALUES ('${randomUUID()}', '${workspace_b}', '${person_b}', '${pipeline_b}', '${stage_b_entry}', 'COMMERCIAL', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`
  },
  {
    table_name: "opportunity_timeline_events",
    read_sql:
      "SELECT workspace_id AS tenant_id FROM opportunity_timeline_events ORDER BY workspace_id",
    write_sql: `INSERT INTO opportunity_timeline_events (id, workspace_id, opportunity_id, type, lead_submission_id, integration_event_id, occurred_at) VALUES ('${randomUUID()}', '${workspace_b}', '${opportunity_b}', 'RETRANSMISSION_RECEIVED', '${lead_submission_b}', '${integration_event_b}', CURRENT_TIMESTAMP)`
  },
  {
    table_name: "person_emails",
    read_sql: "SELECT workspace_id AS tenant_id FROM person_emails ORDER BY workspace_id",
    write_sql: `INSERT INTO person_emails (id, workspace_id, person_id, email) VALUES ('${randomUUID()}', '${workspace_b}', '${person_b}', 'cross@workspace.com')`
  },
  {
    table_name: "person_phones",
    read_sql: "SELECT workspace_id AS tenant_id FROM person_phones ORDER BY workspace_id",
    write_sql: `INSERT INTO person_phones (id, workspace_id, person_id, phone_e164) VALUES ('${randomUUID()}', '${workspace_b}', '${person_b}', '+5511900000000')`
  },
  {
    table_name: "persons",
    read_sql: "SELECT workspace_id AS tenant_id FROM persons ORDER BY workspace_id",
    write_sql: `INSERT INTO persons (id, workspace_id, name, updated_at) VALUES ('${randomUUID()}', '${workspace_b}', 'Cross-workspace', CURRENT_TIMESTAMP)`
  },
  {
    table_name: "pipelines",
    read_sql: "SELECT workspace_id AS tenant_id FROM pipelines ORDER BY workspace_id",
    write_sql: `INSERT INTO pipelines (id, workspace_id, name, type, is_default, updated_at) VALUES ('${randomUUID()}', '${workspace_b}', 'Cross-workspace', 'LEGAL', false, CURRENT_TIMESTAMP)`
  },
  {
    table_name: "stages",
    read_sql: "SELECT workspace_id AS tenant_id FROM stages ORDER BY workspace_id",
    write_sql: `INSERT INTO stages (id, workspace_id, pipeline_id, label, position, role, updated_at) VALUES ('${randomUUID()}', '${workspace_b}', '${pipeline_b}', 'Cross-workspace', 3, 'NORMAL', CURRENT_TIMESTAMP)`
  },
  {
    table_name: "tags",
    read_sql: "SELECT workspace_id AS tenant_id FROM tags ORDER BY workspace_id",
    write_sql: `INSERT INTO tags (id, workspace_id, name) VALUES ('${randomUUID()}', '${workspace_b}', 'Cross-workspace')`
  },
  {
    table_name: "workspace_flags",
    read_sql: "SELECT workspace_id AS tenant_id FROM workspace_flags ORDER BY workspace_id",
    write_sql: `INSERT INTO workspace_flags (workspace_id, key) VALUES ('${workspace_b}', 'score_cabimento_llm')`
  },
  {
    table_name: "workspace_members",
    read_sql:
      "SELECT workspace_id AS tenant_id FROM workspace_members ORDER BY workspace_id",
    write_sql: `INSERT INTO workspace_members (workspace_id, user_id, role) VALUES ('${workspace_b}', '${randomUUID()}', 'ATTENDANT')`
  },
  {
    table_name: "workspace_settings",
    read_sql: "SELECT workspace_id AS tenant_id FROM workspace_settings ORDER BY workspace_id",
    write_sql: `INSERT INTO workspace_settings (workspace_id, first_contact_sla_minutes, stagnation_days, updated_at) VALUES ('${workspace_b}', 15, 3, CURRENT_TIMESTAMP)`
  },
  {
    table_name: "workspaces",
    read_sql: "SELECT id AS tenant_id FROM workspaces ORDER BY id",
    write_sql: `INSERT INTO workspaces (id, slug, name, updated_at) VALUES ('${randomUUID()}', '${randomUUID()}', 'Cross-workspace', CURRENT_TIMESTAMP)`
  }
] as const;

beforeAll(async () => {
  await client.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace_a, slug: workspace_slug_a, name: "Workspace A" },
        { id: workspace_b, slug: workspace_slug_b, name: "Workspace B" }
      ]
    });
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace_a, user_id: user_a, role: "OWNER" },
        { workspace_id: workspace_b, user_id: user_b, role: "ATTENDANT" }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: pipeline_a,
        workspace_id: workspace_a,
        name: "Comercial A",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            {
              id: stage_a_entry,
              label: "Entrada",
              position: 1,
              role: "ENTRY"
            },
            {
              id: stage_a_closing,
              label: "Conclusão",
              position: 2,
              role: "CLOSING"
            }
          ]
        }
      }
    });
    await transaction.pipeline.create({
      data: {
        id: pipeline_b,
        workspace_id: workspace_b,
        name: "Comercial B",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            {
              id: stage_b_entry,
              label: "Entrada",
              position: 1,
              role: "ENTRY"
            },
            {
              id: stage_b_closing,
              label: "Conclusão",
              position: 2,
              role: "CLOSING"
            }
          ]
        }
      }
    });
    await transaction.integrationConnection.createMany({
      data: [
        {
          id: integration_connection_a,
          workspace_id: workspace_a,
          provider: "PLUGA",
          token_hash: token_hash_a,
          token_last4: active_token_a.slice(-4),
          target_pipeline_id: null
        },
        {
          id: integration_connection_b,
          workspace_id: workspace_b,
          provider: "PLUGA",
          token_hash: token_hash_b,
          token_last4: active_token_b.slice(-4),
          target_pipeline_id: pipeline_b
        }
      ]
    });
    await transaction.integrationEvent.createMany({
      data: [
        {
          id: integration_event_a,
          workspace_id: workspace_a,
          integration_connection_id: integration_connection_a,
          raw: { nome: "Lead A" }
        },
        {
          id: integration_event_b,
          workspace_id: workspace_b,
          integration_connection_id: integration_connection_b,
          raw: { nome: "Lead B" }
        }
      ]
    });
    await transaction.person.createMany({
      data: [
        { id: person_a, workspace_id: workspace_a, name: "Pessoa A", cpf: "52998224725" },
        { id: person_b, workspace_id: workspace_b, name: "Pessoa B" },
        // A tombstone, so the merge-pointer scan below runs against a schema
        // where merges have actually happened. Its contacts moved to the
        // canonical row, which is why it has none.
        {
          id: merged_person_a,
          workspace_id: workspace_a,
          name: "Pessoa A (absorvida)",
          merged_into_person_id: person_a
        }
      ]
    });
    await transaction.personPhone.createMany({
      data: [
        { workspace_id: workspace_a, person_id: person_a, phone_e164: "+5511987654321" },
        { workspace_id: workspace_b, person_id: person_b, phone_e164: "+5511912345678" }
      ]
    });
    await transaction.personEmail.createMany({
      data: [
        { workspace_id: workspace_a, person_id: person_a, email: "pessoa.a@exemplo.com" },
        { workspace_id: workspace_b, person_id: person_b, email: "pessoa.b@exemplo.com" }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: carded_pipeline_a,
        workspace_id: workspace_a,
        name: "Com cards",
        type: "COMMERCIAL",
        is_default: false,
        stages: {
          create: [
            { id: carded_stage_a, label: "Entrada", position: 1, role: "ENTRY" },
            { label: "Conclusão", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    // One card, one submission and one pendency per workspace, so the isolation
    // cases below have something of their own to read on each side.
    await transaction.opportunity.createMany({
      data: [
        {
          id: opportunity_a,
          workspace_id: workspace_a,
          person_id: person_a,
          pipeline_id: carded_pipeline_a,
          stage_id: carded_stage_a,
          area: "COMMERCIAL",
          arrived_at: new Date()
        },
        {
          id: opportunity_b,
          workspace_id: workspace_b,
          person_id: person_b,
          pipeline_id: pipeline_b,
          stage_id: stage_b_entry,
          area: "COMMERCIAL",
          arrived_at: new Date()
        }
      ]
    });
    await transaction.leadSubmission.createMany({
      data: [
        {
          id: lead_submission_a,
          workspace_id: workspace_a,
          source: "META_LEAD_ADS",
          external_lead_id: "rls-a",
          last_integration_event_id: integration_event_a,
          opportunity_id: opportunity_a
        },
        {
          id: lead_submission_b,
          workspace_id: workspace_b,
          source: "META_LEAD_ADS",
          external_lead_id: "rls-b",
          last_integration_event_id: integration_event_b,
          opportunity_id: opportunity_b
        }
      ]
    });
    await transaction.intakeReview.createMany({
      data: [
        {
          workspace_id: workspace_a,
          opportunity_id: opportunity_a,
          type: "IDENTITY_CONFLICT",
          candidate_person_ids: [person_a]
        },
        {
          workspace_id: workspace_b,
          opportunity_id: opportunity_b,
          type: "IDENTITY_CONFLICT",
          candidate_person_ids: [person_b]
        }
      ]
    });
    await transaction.opportunityTimelineEvent.createMany({
      data: [
        {
          workspace_id: workspace_a,
          opportunity_id: opportunity_a,
          type: "RETRANSMISSION_RECEIVED",
          lead_submission_id: lead_submission_a,
          integration_event_id: integration_event_a,
          occurred_at: new Date()
        },
        {
          workspace_id: workspace_b,
          opportunity_id: opportunity_b,
          type: "RETRANSMISSION_RECEIVED",
          lead_submission_id: lead_submission_b,
          integration_event_id: integration_event_b,
          occurred_at: new Date()
        }
      ]
    });
    await transaction.workspaceFlag.createMany({
      data: [
        { workspace_id: workspace_a, key: "auto_primeiro_contato" },
        { workspace_id: workspace_b, key: "auto_primeiro_contato" }
      ]
    });
    await transaction.tag.createMany({
      data: [
        { id: tag_a, workspace_id: workspace_a, name: "ACR" },
        { id: tag_b, workspace_id: workspace_b, name: "REAL" },
        { id: tag_b_unapplied, workspace_id: workspace_b, name: "Spare" }
      ]
    });
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace_a, user_id: user_a, tag_id: tag_a },
        { workspace_id: workspace_b, user_id: user_b, tag_id: tag_b }
      ]
    });
    await transaction.workspaceSettings.createMany({
      data: [
        {
          workspace_id: workspace_a,
          first_contact_sla_minutes: 30,
          stagnation_days: 5
        },
        {
          workspace_id: workspace_b,
          first_contact_sla_minutes: 45,
          stagnation_days: 9
        }
      ]
    });
  });
  const context = await resolveUserContextForSlug(user_a, workspace_slug_a, client);
  if (!context) {
    throw new Error("failed to resolve the seeded user workspace");
  }
  user_context_a = context.context;
});

afterAll(async () => {
  const disposable_workspace_ids = [workspace_a, workspace_b, ...provisioned_workspace_ids];
  await client.workspaceMember.deleteMany({
    where: { workspace_id: { in: disposable_workspace_ids } }
  });
  await client.workspace.deleteMany({ where: { id: { in: disposable_workspace_ids } } });
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

    expect(rows.map((row) => row.table_name)).toEqual([
      "intake_reviews",
      "integration_connections",
      "integration_events",
      "lead_submissions",
      "member_tags",
      "opportunities",
      "opportunity_timeline_events",
      "person_emails",
      "person_phones",
      "persons",
      "pipelines",
      "stages",
      "tags",
      "workspace_flags",
      "workspace_members",
      "workspace_settings",
      "workspaces"
    ]);
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
      expect(visible.length).toBeGreaterThan(0);
      expect(visible.every((row) => row.tenant_id === workspace_a)).toBe(true);

      await expect(
        client.$transaction(async (transaction) => {
          await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
          await transaction.$executeRawUnsafe(`SET LOCAL app.workspace_id = '${workspace_a}'`);
          await transaction.$executeRawUnsafe(write_sql);
        })
      ).rejects.toThrow(/permission denied|row-level security policy/i);
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

  it("allows SECURITY DEFINER only in private and only for the declared names", async () => {
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
    // Five, not four: ticket 15 materialized the payload expiry sweep, whose
    // discovery is circular for the same reason `claim_pending_events` is —
    // setting the GUC needs the `workspace_id` only the read reveals (ADR-0019,
    // emendado). Its answer is the narrowest of the five: tenant ids and one
    // event id, never a payload.
    const allowed = new Set([
      "private.claim_pending_events",
      "private.claim_expired_payload_workspaces",
      "private.provision_workspace",
      "private.resolve_workspace_by_token_hash",
      "private.resolve_user_workspaces"
    ]);
    const function_names = functions.map((row) => `${row.schema_name}.${row.function_name}`);
    expect(new Set(function_names).size, "SECURITY DEFINER overloads are forbidden").toBe(
      function_names.length
    );
    expect(
      function_names.filter((function_name) => !allowed.has(function_name))
    ).toEqual([]);
  });

  it("keeps campaign and form as nullable text on opportunities, under the existing RLS, with no extra SECURITY DEFINER", async () => {
    const columns = await client.$queryRaw<
      Array<{ column_name: string; data_type: string; is_nullable: string }>
    >`
      SELECT column_name, data_type, is_nullable
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'opportunities'
        AND column_name IN ('campaign_id', 'campaign_name', 'form_id', 'form_name')
      ORDER BY column_name
    `;
    expect(columns).toEqual([
      { column_name: "campaign_id", data_type: "text", is_nullable: "YES" },
      { column_name: "campaign_name", data_type: "text", is_nullable: "YES" },
      { column_name: "form_id", data_type: "text", is_nullable: "YES" },
      { column_name: "form_name", data_type: "text", is_nullable: "YES" }
    ]);

    const policies = await client.$queryRaw<Array<{ policy_name: string }>>`
      SELECT policyname::text AS policy_name
      FROM pg_policies
      WHERE schemaname = 'public' AND tablename = 'opportunities'
      ORDER BY policyname
    `;
    expect(policies).toEqual([{ policy_name: "opportunities_workspace_isolation" }]);
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

  it("indexes only unresolved Opportunity reviews for marker lookups", async () => {
    // Ticket 12: identity-conflict reviews gained their own resolution
    // column, so "unresolved" now means neither resolution kind is set.
    const rows = await client.$queryRaw<Array<{ predicate: string | null }>>`
      SELECT pg_get_expr(index.indpred, index.indrelid) AS predicate
      FROM pg_index AS index
      WHERE index.indexrelid =
        'public.intake_reviews_workspace_id_opportunity_id_idx'::regclass
    `;
    expect(rows).toEqual([
      { predicate: "((resolution IS NULL) AND (identity_conflict_resolution IS NULL))" }
    ]);
  });

  it("has one partial index per marker, serving both the row filter and the counter", async () => {
    const rows = await client.$queryRaw<Array<{ index_name: string; predicate: string | null }>>`
      SELECT class.relname::text AS index_name, pg_get_expr(index.indpred, index.indrelid) AS predicate
      FROM pg_index AS index
      JOIN pg_class AS class ON class.oid = index.indexrelid
      WHERE class.relname IN (
        'opportunities_workspace_id_arrived_at_id_active_idx',
        'opportunities_missing_phone_active_idx',
        'intake_reviews_identity_conflict_pending_idx',
        'intake_reviews_possible_duplicate_pending_idx'
      )
      ORDER BY class.relname
    `;
    expect(rows).toEqual([
      {
        index_name: "intake_reviews_identity_conflict_pending_idx",
        predicate:
          "((type = 'IDENTITY_CONFLICT'::intake_review_type) AND (resolution IS NULL) AND (identity_conflict_resolution IS NULL))"
      },
      {
        index_name: "intake_reviews_possible_duplicate_pending_idx",
        predicate: "((type = 'POSSIBLE_DUPLICATE'::intake_review_type) AND (resolution IS NULL))"
      },
      {
        index_name: "opportunities_missing_phone_active_idx",
        predicate: "((missing_phone = true) AND (merged_into_opportunity_id IS NULL))"
      },
      {
        index_name: "opportunities_workspace_id_arrived_at_id_active_idx",
        predicate: "(merged_into_opportunity_id IS NULL)"
      }
    ]);
  });

  it("keeps the private schema unreachable to the worker role", async () => {
    const privileges = await client.$queryRaw<Array<{ can_use: boolean }>>`
      SELECT has_schema_privilege('marctco_worker', 'private', 'USAGE') AS can_use
    `;
    expect(privileges).toEqual([{ can_use: false }]);
  });

  it("enforces default, entry and closing pipeline invariants in the database", async () => {
    await expect(
      client.$transaction((transaction) =>
        transaction.workspace.create({
          data: {
            id: randomUUID(),
            slug: randomUUID(),
            name: "Workspace sem funil padrão"
          }
        })
      )
    ).rejects.toThrow(/exactly one default commercial pipeline/i);

    await expect(
      client.pipeline.create({
        data: {
          workspace_id: workspace_a,
          name: "Legal sem etapas",
          type: "LEGAL",
          is_default: false
        }
      })
    ).rejects.toThrow(/exactly one ENTRY/i);

    await expect(
      client.pipeline.create({
        data: {
          workspace_id: workspace_a,
          name: "Legal não pode ser padrão",
          type: "LEGAL",
          is_default: true,
          stages: {
            create: [
              { label: "Entrada", position: 1, role: "ENTRY" },
              { label: "Conclusão", position: 2, role: "CLOSING" }
            ]
          }
        }
      })
    ).rejects.toThrow(/check constraint/i);

    await expect(
      client.stage.create({
        data: {
          workspace_id: workspace_a,
          pipeline_id: pipeline_a,
          label: "Outra entrada",
          position: 3,
          role: "ENTRY"
        }
      })
    ).rejects.toThrow(/unique/i);

    await expect(
      client.$transaction((transaction) =>
        transaction.stage.delete({ where: { id: stage_a_closing } })
      )
    ).rejects.toThrow(/at least one CLOSING/i);

    await expect(
      client.pipeline.create({
        data: {
          workspace_id: workspace_a,
          name: "Outro comercial",
          type: "COMMERCIAL",
          is_default: true,
          stages: {
            create: [
              {
                label: "Entrada",
                position: 1,
                role: "ENTRY"
              },
              {
                label: "Conclusão",
                position: 2,
                role: "CLOSING"
              }
            ]
          }
        }
      })
    ).rejects.toThrow(/unique/i);
  });

  it("reorders, replaces required roles and deletes through named transactional operations", async () => {
    const editable_pipeline = await client.pipeline.create({
      data: {
        workspace_id: workspace_a,
        name: "Editável",
        type: "COMMERCIAL",
        is_default: false,
        stages: {
          create: [
            {
              label: "Entrada",
              position: 1,
              role: "ENTRY"
            },
            {
              label: "Trabalho",
              position: 2,
              role: "NORMAL"
            },
            {
              label: "Conclusão",
              position: 3,
              role: "CLOSING"
            }
          ]
        }
      },
      include: { stages: { orderBy: { position: "asc" } } }
    });
    const [entry, normal, closing] = editable_pipeline.stages;
    if (!entry || !normal || !closing) {
      throw new Error("failed to create editable pipeline stages");
    }

    await reorderStages(
      user_context_a,
      {
        pipeline_id: editable_pipeline.id,
        ordered_stage_ids: [closing.id, entry.id, normal.id]
      },
      client
    );
    expect(
      await client.stage.findMany({
        where: { pipeline_id: editable_pipeline.id },
        select: { id: true, position: true },
        orderBy: { position: "asc" }
      })
    ).toEqual([
      { id: closing.id, position: 1 },
      { id: entry.id, position: 2 },
      { id: normal.id, position: 3 }
    ]);

    await replaceStageRoles(
      user_context_a,
      {
        pipeline_id: editable_pipeline.id,
        stages: [
          { stage_id: closing.id, role: "CLOSING" },
          { stage_id: entry.id, role: "NORMAL" },
          { stage_id: normal.id, role: "ENTRY" }
        ]
      },
      client
    );
    await expect(
      deleteStage(user_context_a, { stage_id: normal.id }, client)
    ).rejects.toThrow(/needs a replacement/i);
    await deleteStage(
      user_context_a,
      { stage_id: normal.id, replacement_stage_id: entry.id },
      client
    );
    expect(await client.stage.findUnique({ where: { id: normal.id } })).toBeNull();
    expect((await client.stage.findUnique({ where: { id: entry.id } }))?.role).toBe("ENTRY");

    await deletePipeline(user_context_a, { pipeline_id: editable_pipeline.id }, client);
    expect(await client.pipeline.findUnique({ where: { id: editable_pipeline.id } })).toBeNull();

    await expect(deletePipeline(user_context_a, { pipeline_id: pipeline_a }, client)).rejects.toThrow(
      /needs a replacement/i
    );
    const successor = await client.pipeline.create({
      data: {
        workspace_id: workspace_a,
        name: "Sucessor padrão",
        type: "COMMERCIAL",
        is_default: false,
        stages: {
          create: [
            { label: "Entrada", position: 1, role: "ENTRY" },
            { label: "Conclusão", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await deletePipeline(
      user_context_a,
      {
        pipeline_id: pipeline_a,
        replacement_default_pipeline_id: successor.id
      },
      client
    );
    expect((await client.pipeline.findUnique({ where: { id: successor.id } }))?.is_default).toBe(true);
  });

  it.each(["marctco_app", "marctco_worker"] as const)(
    "%s cannot read a business table before app.workspace_id is set",
    async (role) => {
      const visible = await client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe(`SET LOCAL ROLE ${role}`);
        return transaction.$queryRaw<Array<{ workspace_id: string }>>`
          SELECT workspace_id FROM workspace_members ORDER BY workspace_id
        `;
      });
      expect(visible).toEqual([]);
    }
  );

  it("keeps the pre-GUC resolver role technical, NOLOGIN and subject to RLS", async () => {
    const roles = await client.$queryRaw<
      Array<{ can_login: boolean; is_superuser: boolean; bypasses_rls: boolean }>
    >`
      SELECT rolcanlogin AS can_login, rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
      FROM pg_roles
      WHERE rolname = 'marctco_private_definer'
    `;
    expect(roles).toEqual([{ can_login: false, is_superuser: false, bypasses_rls: false }]);
  });

  it("keeps the private resolver owned, scoped and executable only as declared", async () => {
    const functions = await client.$queryRaw<
      Array<{
        owner_name: string;
        search_path: string[] | null;
        public_can_execute: boolean;
        app_can_execute: boolean;
        worker_can_execute: boolean;
      }>
    >`
      SELECT
        pg_get_userbyid(procedure.proowner)::text AS owner_name,
        procedure.proconfig AS search_path,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
          WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
        ) AS public_can_execute,
        has_function_privilege('marctco_app', procedure.oid, 'EXECUTE') AS app_can_execute,
        has_function_privilege('marctco_worker', procedure.oid, 'EXECUTE') AS worker_can_execute
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'private' AND procedure.proname = 'resolve_user_workspaces'
    `;
    expect(functions).toEqual([
      {
        owner_name: 'marctco_private_definer',
        search_path: ['search_path=pg_catalog'],
        public_can_execute: false,
        app_can_execute: true,
        worker_can_execute: false
      }
    ]);

    const memberships = await client.$queryRaw<Array<{ runtime_can_assume_definer: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_auth_members AS membership
        JOIN pg_roles AS parent_role ON parent_role.oid = membership.roleid
        JOIN pg_roles AS member_role ON member_role.oid = membership.member
        WHERE parent_role.rolname = 'marctco_private_definer'
          AND member_role.rolname IN ('marctco_app', 'marctco_worker')
      ) AS runtime_can_assume_definer
    `;
    expect(memberships).toEqual([{ runtime_can_assume_definer: false }]);
  });

  it("resolves only the workspace for an active integration token before a workspace GUC exists", async () => {
    const resolved = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
      return transaction.$queryRaw<
        Array<{ workspace_id: string }>
      >`
        SELECT workspace_id
        FROM private.resolve_workspace_by_token_hash(${token_hash_a})
      `;
    });
    expect(resolved).toEqual([
      { workspace_id: workspace_a }
    ]);

    await client.integrationConnection.update({
      where: { id: integration_connection_a },
      data: { status: "DISABLED" }
    });
    const disabled = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
      return transaction.$queryRaw<Array<{ workspace_id: string }>>`
        SELECT workspace_id
        FROM private.resolve_workspace_by_token_hash(${token_hash_a})
      `;
    });
    expect(disabled).toEqual([]);
    await client.integrationConnection.update({
      where: { id: integration_connection_a },
      data: { status: "ACTIVE" }
    });
  });

  it("gives the token resolver only its declared private execution and SELECT surface", async () => {
    const functions = await client.$queryRaw<
      Array<{
        owner_name: string;
        search_path: string[] | null;
        public_can_execute: boolean;
        app_can_execute: boolean;
        worker_can_execute: boolean;
      }>
    >`
      SELECT
        pg_get_userbyid(procedure.proowner)::text AS owner_name,
        procedure.proconfig AS search_path,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
          WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
        ) AS public_can_execute,
        has_function_privilege('marctco_app', procedure.oid, 'EXECUTE') AS app_can_execute,
        has_function_privilege('marctco_worker', procedure.oid, 'EXECUTE') AS worker_can_execute
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'private' AND procedure.proname = 'resolve_workspace_by_token_hash'
    `;
    expect(functions).toEqual([
      {
        owner_name: "marctco_private_definer",
        search_path: ["search_path=pg_catalog"],
        public_can_execute: false,
        app_can_execute: true,
        worker_can_execute: false
      }
    ]);

    const permissions = await client.$queryRaw<
      Array<{
        can_select_connections: boolean;
        can_select_pipelines: boolean;
        can_insert_connections: boolean;
        can_update_connections: boolean;
      }>
    >`
      SELECT
        has_table_privilege('marctco_private_definer', 'public.integration_connections', 'SELECT') AS can_select_connections,
        has_table_privilege('marctco_private_definer', 'public.pipelines', 'SELECT') AS can_select_pipelines,
        has_table_privilege('marctco_private_definer', 'public.integration_connections', 'INSERT') AS can_insert_connections,
        has_table_privilege('marctco_private_definer', 'public.integration_connections', 'UPDATE') AS can_update_connections
    `;
    expect(permissions).toEqual([
      {
        can_select_connections: true,
        can_select_pipelines: false,
        can_insert_connections: false,
        can_update_connections: false
      }
    ]);
  });

  it("enforces a unique indexed SHA-256 hash and a commercial target in the database", async () => {
    const hash_index = await client.$queryRaw<Array<{ indexed: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_index AS index
        JOIN pg_attribute AS attribute
          ON attribute.attrelid = index.indrelid
         AND attribute.attnum = index.indkey[0]
        WHERE index.indrelid = 'public.integration_connections'::regclass
          AND index.indisunique
          AND attribute.attname = 'token_hash'
      ) AS indexed
    `;
    expect(hash_index).toEqual([{ indexed: true }]);

    await expect(
      client.integrationConnection.create({
        data: {
          workspace_id: workspace_a,
          provider: "LANDING_PAGE",
          token_hash: token_hash_a,
          token_last4: "same"
        }
      })
    ).rejects.toThrow(/unique/i);

    const legal_pipeline = await client.pipeline.create({
      data: {
        workspace_id: workspace_a,
        name: "Jurídico A",
        type: "LEGAL",
        stages: {
          create: [
            { label: "Entrada", position: 1, role: "ENTRY" },
            { label: "Conclusão", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    const legal_hash = createHash("sha256")
      .update(`mtco_legal_${randomUUID()}`, "utf8")
      .digest("hex");
    await expect(
      client.integrationConnection.create({
        data: {
          workspace_id: workspace_a,
          provider: "LANDING_PAGE",
          token_hash: legal_hash,
          token_last4: "lega",
          target_pipeline_id: legal_pipeline.id
        }
      })
    ).rejects.toThrow(/target pipeline must be commercial/i);
    await client.pipeline.delete({ where: { id: legal_pipeline.id } });
  });

  it("prevents a targeted commercial pipeline from becoming legal later", async () => {
    const target_pipeline = await client.pipeline.create({
      data: {
        workspace_id: workspace_a,
        name: "Comercial roteado",
        type: "COMMERCIAL",
        is_default: false,
        stages: {
          create: [
            { label: "Entrada", position: 1, role: "ENTRY" },
            { label: "Conclusão", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    const connection = await client.integrationConnection.create({
      data: {
        workspace_id: workspace_a,
        provider: "LANDING_PAGE",
        token_hash: createHash("sha256")
          .update(`mtco_target_${randomUUID()}`, "utf8")
          .digest("hex"),
        token_last4: "rget",
        target_pipeline_id: target_pipeline.id
      }
    });

    await expect(
      client.$transaction((transaction) =>
        transaction.pipeline.update({
          where: { id: target_pipeline.id },
          data: { type: "LEGAL" }
        })
      )
    ).rejects.toThrow(/must remain commercial/i);

    await client.integrationConnection.delete({ where: { id: connection.id } });
    await client.pipeline.delete({ where: { id: target_pipeline.id } });
  });

  it("resolves membership before a request has a workspace GUC", async () => {
    const resolved_as_app = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe('SET LOCAL ROLE marctco_app');
      return transaction.$queryRaw<
        Array<{ workspace_id: string; workspace_slug: string; workspace_role: string }>
      >`
        SELECT workspace_id, workspace_slug, workspace_role::text
        FROM private.resolve_user_workspaces(${user_a}::uuid, ${workspace_slug_a}::uuid)
      `;
    });
    expect(resolved_as_app).toEqual([
      { workspace_id: workspace_a, workspace_slug: workspace_slug_a, workspace_role: 'OWNER' }
    ]);

    const selected = await resolveUserContextForSlug(user_a, workspace_slug_a, client);
    expect(selected).toMatchObject({
      workspace_id: workspace_a,
      slug: workspace_slug_a,
      role: "OWNER"
    });
    expect(selected?.context).toMatchObject({
      workspace_id: workspace_a,
      user_id: user_a,
      role: "OWNER"
    });

    const foreign = await resolveUserContextForSlug(user_a, workspace_slug_b, client);
    expect(foreign).toBeNull();

    const choices = await listUserWorkspaces({ authenticated_user_id: user_a }, client);
    expect(choices).toEqual([
      {
        workspace_id: workspace_a,
        slug: workspace_slug_a,
        name: "Workspace A",
        role: "OWNER"
      }
    ]);
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
      // `persons.merged_into_person_id` is a real tombstone, and the seeded
      // data is deliberately clean. So the probe stays: it synthesizes the
      // same shape *with* a violation in it, which is what proves the scan
      // finds one instead of trivially passing because everything is fine.
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

      // Every foreign key in the schema, with its columns paired in the order
      // the constraint declares them.
      //
      // pg_catalog and not information_schema: a foreign key can span more
      // than one column, and `constraint_column_usage` reports the referencing
      // and the referenced columns as two unordered sets. Pairing those by
      // joining on the constraint name yields the cartesian product — for
      // `person_phones (workspace_id, person_id) → persons (workspace_id, id)`
      // it invents a join on `workspace_id = workspace_id`, which counts every
      // contact row in a workspace that merely *contains* a merged Pessoa as a
      // violation. `conkey` and `confkey` are ordered arrays, and unnesting
      // them together is the only pairing that is actually the constraint.
      const foreign_key_columns = await transaction.$queryRaw<
        Array<{
          constraint_name: string;
          referencing_table: string;
          referencing_column: string;
          target_table: string;
          target_column: string;
        }>
      >`
        SELECT
          foreign_key.conname::text AS constraint_name,
          referencing.relname::text AS referencing_table,
          referencing_attribute.attname::text AS referencing_column,
          target.relname::text AS target_table,
          target_attribute.attname::text AS target_column
        FROM pg_constraint AS foreign_key
        JOIN pg_class AS referencing ON referencing.oid = foreign_key.conrelid
        JOIN pg_namespace AS referencing_namespace
          ON referencing_namespace.oid = referencing.relnamespace
        JOIN pg_class AS target ON target.oid = foreign_key.confrelid
        CROSS JOIN LATERAL unnest(foreign_key.conkey, foreign_key.confkey)
          WITH ORDINALITY AS key(referencing_attnum, target_attnum, position)
        JOIN pg_attribute AS referencing_attribute
          ON referencing_attribute.attrelid = foreign_key.conrelid
         AND referencing_attribute.attnum = key.referencing_attnum
        JOIN pg_attribute AS target_attribute
          ON target_attribute.attrelid = foreign_key.confrelid
         AND target_attribute.attnum = key.target_attnum
        WHERE foreign_key.contype = 'f'
          AND referencing_namespace.nspname = 'public'
        ORDER BY foreign_key.conname, key.position
      `;

      const constraints = new Map<
        string,
        {
          referencing_table: string;
          target_table: string;
          pairs: Array<{ referencing_column: string; target_column: string }>;
        }
      >();
      for (const column of foreign_key_columns) {
        const existing = constraints.get(column.constraint_name) ?? {
          referencing_table: column.referencing_table,
          target_table: column.target_table,
          pairs: []
        };
        existing.pairs.push({
          referencing_column: column.referencing_column,
          target_column: column.target_column
        });
        constraints.set(column.constraint_name, existing);
      }

      // Step 1: discover every self-referencing "merged_into_*" tombstone
      // column in the schema. This is what makes the scan automatic — a future
      // Opportunity.merged_into_opportunity_id needs no change here.
      const merge_pointers = new Map<string, string>();
      for (const constraint of constraints.values()) {
        if (constraint.referencing_table !== constraint.target_table) {
          continue;
        }
        for (const pair of constraint.pairs) {
          if (pair.referencing_column.startsWith("merged_into_")) {
            merge_pointers.set(constraint.target_table, pair.referencing_column);
          }
        }
      }
      // `opportunities.merged_into_opportunity_id` arrived with ticket 09 and
      // this scan needed no edit to pick it up — which was the point of
      // discovering the tombstones instead of listing them.
      expect([...merge_pointers].sort()).toEqual([
        ["opportunities", "merged_into_opportunity_id"],
        ["persons", "merged_into_person_id"],
        [target_table, "merged_into_probe_target_id"]
      ]);

      // Step 2: every foreign key that targets one of those tables is a place
      // an active row could be pointing at a tombstone.
      let violations = 0;
      for (const constraint of constraints.values()) {
        const merge_column = merge_pointers.get(constraint.target_table);
        if (merge_column === undefined) {
          continue;
        }
        const join_condition = constraint.pairs
          .map(
            (pair) =>
              `referencing."${pair.referencing_column}" = target."${pair.target_column}"`
          )
          .join(" AND ");
        const rows = await transaction.$queryRawUnsafe<Array<{ violations: bigint }>>(`
          SELECT COUNT(*) AS violations
          FROM "${constraint.referencing_table}" AS referencing
          JOIN "${constraint.target_table}" AS target ON ${join_condition}
          WHERE target."${merge_column}" IS NOT NULL
        `);
        violations += Number(rows[0]?.violations ?? 0n);
      }

      // Exactly one: the synthetic referencing row, which proves the scan
      // finds a real violation rather than passing because it found nothing to
      // check. The real `persons` tombstone contributes none — a merged Pessoa
      // has had everything that hung off it repointed at the canonical row.
      expect(violations).toBe(1);

      await transaction.$executeRawUnsafe(`DROP TABLE ${referencing_table}`);
      await transaction.$executeRawUnsafe(`DROP TABLE ${target_table}`);
    });
  });
});

describe("Seam 3: withAccessContext is the single production path to data (ADR-0016)", () => {
  it("scopes a UserContext read to its own workspace, under the app role", async () => {
    const visible = await withAccessContext(client, user_context_a, async (transaction) => {
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
    await withAccessContext(client, user_context_a, async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
      await transaction.$queryRaw`SELECT 1`;
    });

    const after = await client.$queryRaw<Array<{ workspace_id: string }>>`
      SELECT current_setting('app.workspace_id', true)::text AS workspace_id
    `;
    expect(after).toEqual([{ workspace_id: "" }]);
  });

  it("fails closed and never opens the transaction for an unknown role, even past the constructor", async () => {
    // The context resolver already refuses this; this proves the helper itself
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

async function provisionAsApp(
  owner_user_id: string,
  workspace_name: string,
  definition: unknown = defaultCommercialPipeline
): Promise<string | undefined> {
  const rows = await client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
    return transaction.$queryRaw<Array<{ workspace_id: string }>>`
      SELECT workspace_id
      FROM private.provision_workspace(
        ${owner_user_id}::uuid,
        ${workspace_name}::text,
        ${JSON.stringify(definition)}::jsonb
      )
    `;
  });
  const workspace_id = rows[0]?.workspace_id;
  if (workspace_id) {
    provisioned_workspace_ids.push(workspace_id);
  }
  return workspace_id;
}

describe("Seam 2 + Seam 3: first access provisions a usable workspace (ticket 17)", () => {
  it("creates the tenant, its owner and the default pipeline in a single commit", async () => {
    const owner = randomUUID();
    const workspace_id = await provisionAsApp(owner, "Assessoria Provisionada");
    if (!workspace_id) {
      throw new Error("provisioning returned no workspace");
    }

    const workspace = await client.workspace.findUniqueOrThrow({ where: { id: workspace_id } });
    expect(workspace.name).toBe("Assessoria Provisionada");
    expect(workspace.slug).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    );

    const members = await client.workspaceMember.findMany({ where: { workspace_id } });
    expect(members).toMatchObject([{ user_id: owner, role: "OWNER" }]);

    // The ingestion destination exists before the first lead can arrive: one
    // commercial pipeline marked default, with its ENTRY and CLOSING stages.
    const pipelines = await client.pipeline.findMany({
      where: { workspace_id },
      include: { stages: { orderBy: { position: "asc" } } }
    });
    expect(pipelines).toHaveLength(1);
    expect(pipelines[0]).toMatchObject({
      name: defaultCommercialPipeline.name,
      type: "COMMERCIAL",
      is_default: true
    });
    expect(
      pipelines[0]?.stages.map((stage) => ({
        label: stage.label,
        position: stage.position,
        role: stage.role
      }))
    ).toEqual(defaultCommercialPipeline.stages.map((stage) => ({ ...stage })));
  });

  it("returns the workspace of the same name instead of a second one", async () => {
    const owner = randomUUID();
    const [first, second] = await Promise.all([
      provisionAsApp(owner, "Duas abas"),
      provisionAsApp(owner, "Duas abas")
    ]);

    expect(first).toBeDefined();
    expect(second).toBe(first);
    await expect(
      client.workspaceMember.count({ where: { user_id: owner } })
    ).resolves.toBe(1);
  });

  it("creates a second tenant for an owner already associated when the name is new", async () => {
    const owner = randomUUID();
    const hugs = await provisionAsApp(owner, "Hugs");
    const acr = await provisionAsApp(owner, "ACR");

    expect(hugs).toBeDefined();
    expect(acr).toBeDefined();
    expect(acr).not.toBe(hugs);
    await expect(
      client.workspaceMember.count({ where: { user_id: owner, role: "OWNER" } })
    ).resolves.toBe(2);
  });

  it("leaves nothing behind when the workspace cannot be born valid", async () => {
    const owner = randomUUID();
    await expect(
      provisionAsApp(owner, "Sem conclusão", {
        ...defaultCommercialPipeline,
        stages: defaultCommercialPipeline.stages.filter((stage) => stage.role !== "CLOSING")
      })
    ).rejects.toThrow(/at least one CLOSING/i);

    await expect(client.workspaceMember.count({ where: { user_id: owner } })).resolves.toBe(0);
    await expect(
      client.workspace.count({ where: { name: "Sem conclusão" } })
    ).resolves.toBe(0);
  });

  it("refuses an unnamed workspace at the database boundary", async () => {
    await expect(provisionAsApp(randomUUID(), "   ")).rejects.toThrow(/workspace_name/i);
  });

  it("hands the caller a slug it can only reach through its own membership", async () => {
    const owner = randomUUID();
    const provisioned = await provisionWorkspace(
      { owner_user_id: owner, workspace_name: "Assessoria Horizonte" },
      client
    );
    provisioned_workspace_ids.push(provisioned.workspace_id);

    const workspace = await client.workspace.findUniqueOrThrow({
      where: { id: provisioned.workspace_id }
    });
    expect(provisioned.slug).toBe(workspace.slug);
    await expect(
      resolveUserContextForSlug(owner, provisioned.slug, client)
    ).resolves.toMatchObject({ workspace_id: provisioned.workspace_id, role: "OWNER" });
  });

  it("keeps the provisioning executor technical, NOLOGIN and subject to RLS", async () => {
    const roles = await client.$queryRaw<
      Array<{ can_login: boolean; is_superuser: boolean; bypasses_rls: boolean }>
    >`
      SELECT rolcanlogin AS can_login, rolsuper AS is_superuser, rolbypassrls AS bypasses_rls
      FROM pg_roles
      WHERE rolname = 'marctco_provisioner'
    `;
    expect(roles).toEqual([{ can_login: false, is_superuser: false, bypasses_rls: false }]);

    const memberships = await client.$queryRaw<Array<{ runtime_can_assume_provisioner: boolean }>>`
      SELECT EXISTS (
        SELECT 1
        FROM pg_auth_members AS membership
        JOIN pg_roles AS parent_role ON parent_role.oid = membership.roleid
        JOIN pg_roles AS member_role ON member_role.oid = membership.member
        WHERE parent_role.rolname = 'marctco_provisioner'
          AND member_role.rolname IN ('marctco_app', 'marctco_worker')
      ) AS runtime_can_assume_provisioner
    `;
    expect(memberships).toEqual([{ runtime_can_assume_provisioner: false }]);
  });

  it("keeps the provisioner owned, scoped and executable only as declared", async () => {
    const functions = await client.$queryRaw<
      Array<{
        owner_name: string;
        search_path: string[] | null;
        public_can_execute: boolean;
        app_can_execute: boolean;
        worker_can_execute: boolean;
      }>
    >`
      SELECT
        pg_get_userbyid(procedure.proowner)::text AS owner_name,
        procedure.proconfig AS search_path,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
          WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
        ) AS public_can_execute,
        has_function_privilege('marctco_app', procedure.oid, 'EXECUTE') AS app_can_execute,
        has_function_privilege('marctco_worker', procedure.oid, 'EXECUTE') AS worker_can_execute
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'private' AND procedure.proname = 'provision_workspace'
    `;
    expect(functions).toEqual([
      {
        owner_name: "marctco_provisioner",
        search_path: ["search_path=pg_catalog"],
        public_can_execute: false,
        app_can_execute: true,
        worker_can_execute: false
      }
    ]);
  });

  it("gives provisioning its own write surface and leaves the read-only executor read-only", async () => {
    const privileges = await client.$queryRaw<
      Array<{
        provisioner_inserts_workspaces: boolean;
        provisioner_inserts_members: boolean;
        provisioner_inserts_pipelines: boolean;
        provisioner_inserts_stages: boolean;
        provisioner_updates_workspaces: boolean;
        provisioner_deletes_workspaces: boolean;
        provisioner_reads_connections: boolean;
        definer_inserts_workspaces: boolean;
        definer_inserts_pipelines: boolean;
      }>
    >`
      SELECT
        has_table_privilege('marctco_provisioner', 'public.workspaces', 'INSERT') AS provisioner_inserts_workspaces,
        has_table_privilege('marctco_provisioner', 'public.workspace_members', 'INSERT') AS provisioner_inserts_members,
        has_table_privilege('marctco_provisioner', 'public.pipelines', 'INSERT') AS provisioner_inserts_pipelines,
        has_table_privilege('marctco_provisioner', 'public.stages', 'INSERT') AS provisioner_inserts_stages,
        has_table_privilege('marctco_provisioner', 'public.workspaces', 'UPDATE') AS provisioner_updates_workspaces,
        has_table_privilege('marctco_provisioner', 'public.workspaces', 'DELETE') AS provisioner_deletes_workspaces,
        has_table_privilege('marctco_provisioner', 'public.integration_connections', 'SELECT') AS provisioner_reads_connections,
        has_table_privilege('marctco_private_definer', 'public.workspaces', 'INSERT') AS definer_inserts_workspaces,
        has_table_privilege('marctco_private_definer', 'public.pipelines', 'INSERT') AS definer_inserts_pipelines
    `;
    expect(privileges).toEqual([
      {
        provisioner_inserts_workspaces: true,
        provisioner_inserts_members: true,
        provisioner_inserts_pipelines: true,
        provisioner_inserts_stages: true,
        provisioner_updates_workspaces: false,
        provisioner_deletes_workspaces: false,
        provisioner_reads_connections: false,
        definer_inserts_workspaces: false,
        definer_inserts_pipelines: false
      }
    ]);
  });

  it("lets the dispatcher find pending work without a tenant, and returns nothing else", async () => {
    const pending_event_id = randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO integration_events (id, workspace_id, integration_connection_id, raw, updated_at)
      VALUES ('${pending_event_id}', '${workspace_a}', '${integration_connection_a}', '{"nome":"Pendente"}'::jsonb, CURRENT_TIMESTAMP)
    `);

    try {
      const claimed = await client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
        return transaction.$queryRaw<Array<Record<string, unknown>>>`
          SELECT * FROM private.claim_pending_events(50::integer)
        `;
      });

      const claimed_event = claimed.find((row) => row.id === pending_event_id);
      expect(claimed_event).toBeDefined();
      // The payload carries CPF and phone numbers, and this function runs with
      // no tenant at all: `(id, workspace_id)` is the entire permitted answer.
      expect(Object.keys(claimed_event ?? {}).sort()).toEqual(["id", "workspace_id"]);
      expect(claimed_event).toEqual({ id: pending_event_id, workspace_id: workspace_a });
    } finally {
      await client.$executeRawUnsafe(
        `DELETE FROM integration_events WHERE id = '${pending_event_id}'`
      );
    }
  });

  it("keeps the pending-events resolver owned, scoped and executable only as declared", async () => {
    const functions = await client.$queryRaw<
      Array<{
        owner_name: string;
        search_path: string[] | null;
        public_can_execute: boolean;
        app_can_execute: boolean;
        worker_can_execute: boolean;
      }>
    >`
      SELECT
        pg_get_userbyid(procedure.proowner)::text AS owner_name,
        procedure.proconfig AS search_path,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
          WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
        ) AS public_can_execute,
        has_function_privilege('marctco_app', procedure.oid, 'EXECUTE') AS app_can_execute,
        has_function_privilege('marctco_worker', procedure.oid, 'EXECUTE') AS worker_can_execute
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'private' AND procedure.proname = 'claim_pending_events'
    `;
    expect(functions).toEqual([
      {
        owner_name: "marctco_private_definer",
        search_path: ["search_path=pg_catalog"],
        public_can_execute: false,
        app_can_execute: true,
        worker_can_execute: false
      }
    ]);
  });

  it("holds every private function to the same contract, not just the ones with a test", async () => {
    // Ticket 03 left this as carried debt — "EXECUTE revogado de todo papel
    // exceto o do app, e `search_path` fixado por função", to be closed once
    // the last of them existed. Written as a sweep rather than a fifth
    // hand-written case so the sixth function, whenever it comes, is held to
    // it without anyone remembering to add a test.
    const functions = await client.$queryRaw<
      Array<{
        function_name: string;
        search_path: string[] | null;
        public_can_execute: boolean;
        worker_can_execute: boolean;
        owner_can_login: boolean;
        owner_bypasses_rls: boolean;
      }>
    >`
      SELECT
        procedure.proname::text AS function_name,
        procedure.proconfig AS search_path,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
          WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
        ) AS public_can_execute,
        has_function_privilege('marctco_worker', procedure.oid, 'EXECUTE') AS worker_can_execute,
        owner.rolcanlogin AS owner_can_login,
        owner.rolbypassrls AS owner_bypasses_rls
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      JOIN pg_roles AS owner ON owner.oid = procedure.proowner
      WHERE namespace.nspname = 'private' AND procedure.prosecdef
    `;

    expect(functions.length).toBeGreaterThanOrEqual(5);
    for (const routine of functions) {
      expect(routine.search_path, routine.function_name).toEqual(["search_path=pg_catalog"]);
      expect(routine.public_can_execute, routine.function_name).toBe(false);
      expect(routine.worker_can_execute, routine.function_name).toBe(false);
      expect(routine.owner_can_login, routine.function_name).toBe(false);
      expect(routine.owner_bypasses_rls, routine.function_name).toBe(false);
    }
  });

  it("lets the expiry sweep find tenants without a tenant, and answers only with ids", async () => {
    const ancient_event_id = randomUUID();
    await client.$executeRawUnsafe(`
      INSERT INTO integration_events (id, workspace_id, integration_connection_id, raw, received_at, updated_at)
      VALUES ('${ancient_event_id}', '${workspace_a}', '${integration_connection_a}', '{"nome":"Antigo"}'::jsonb, CURRENT_TIMESTAMP - INTERVAL '200 days', CURRENT_TIMESTAMP)
    `);

    try {
      const discovered = await client.$transaction(async (transaction) => {
        await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_app");
        return transaction.$queryRaw<Array<Record<string, unknown>>>`
          SELECT *
          FROM private.claim_expired_payload_workspaces(
            (CURRENT_TIMESTAMP - INTERVAL '90 days')::timestamptz
          )
        `;
      });

      const row = discovered.find((candidate) => candidate.workspace_id === workspace_a);
      expect(row).toBeDefined();
      // The payload is what the 90 days exist to remove; a function running
      // with no tenant may not carry it out of the tenant on the way.
      expect(Object.keys(row ?? {}).sort()).toEqual([
        "anchor_integration_event_id",
        "workspace_id"
      ]);
    } finally {
      await client.$executeRawUnsafe(
        `DELETE FROM integration_events WHERE id = '${ancient_event_id}'`
      );
    }
  });

  it("keeps the expiry resolver owned, scoped and executable only as declared", async () => {
    const functions = await client.$queryRaw<
      Array<{
        owner_name: string;
        search_path: string[] | null;
        public_can_execute: boolean;
        app_can_execute: boolean;
        worker_can_execute: boolean;
      }>
    >`
      SELECT
        pg_get_userbyid(procedure.proowner)::text AS owner_name,
        procedure.proconfig AS search_path,
        EXISTS (
          SELECT 1
          FROM aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) AS privilege
          WHERE privilege.grantee = 0 AND privilege.privilege_type = 'EXECUTE'
        ) AS public_can_execute,
        has_function_privilege('marctco_app', procedure.oid, 'EXECUTE') AS app_can_execute,
        has_function_privilege('marctco_worker', procedure.oid, 'EXECUTE') AS worker_can_execute
      FROM pg_proc AS procedure
      JOIN pg_namespace AS namespace ON namespace.oid = procedure.pronamespace
      WHERE namespace.nspname = 'private'
        AND procedure.proname = 'claim_expired_payload_workspaces'
    `;
    expect(functions).toEqual([
      {
        owner_name: "marctco_private_definer",
        search_path: ["search_path=pg_catalog"],
        public_can_execute: false,
        app_can_execute: true,
        worker_can_execute: false
      }
    ]);
  });

  it("never lets the technical executor of the pre-tenant reads see a payload", async () => {
    // The containment that makes a fifth function safe to add: the executor
    // gained no privilege for it. Reading `raw` without a tenant would fail on
    // the grant, not on code review.
    const privileges = await client.$queryRaw<
      Array<{ reads_ids: boolean; reads_raw: boolean; writes_events: boolean }>
    >`
      SELECT
        has_column_privilege('marctco_private_definer', 'public.integration_events', 'workspace_id', 'SELECT') AS reads_ids,
        has_column_privilege('marctco_private_definer', 'public.integration_events', 'raw', 'SELECT') AS reads_raw,
        has_table_privilege('marctco_private_definer', 'public.integration_events', 'UPDATE') AS writes_events
    `;
    expect(privileges).toEqual([{ reads_ids: true, reads_raw: false, writes_events: false }]);
  });

  it("scopes the worker role to its own tenant's events, and to nothing without a GUC", async () => {
    // The Seam 2 pipeline runs as the app role; this is the same policy seen
    // from the role the worker actually connects with in production.
    const unscoped = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_worker");
      return transaction.$queryRaw<Array<{ id: string }>>`SELECT id FROM integration_events`;
    });
    expect(unscoped).toEqual([]);

    const scoped = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_worker");
      await transaction.$executeRawUnsafe(`SET LOCAL app.workspace_id = '${workspace_a}'`);
      return transaction.$queryRaw<Array<{ workspace_id: string }>>`
        SELECT workspace_id FROM integration_events
      `;
    });
    expect(scoped.length).toBeGreaterThan(0);
    expect(scoped.every((row) => row.workspace_id === workspace_a)).toBe(true);

    const marks_processed = await client.$transaction(async (transaction) => {
      await transaction.$executeRawUnsafe("SET LOCAL ROLE marctco_worker");
      await transaction.$executeRawUnsafe(`SET LOCAL app.workspace_id = '${workspace_a}'`);
      return transaction.$executeRawUnsafe(`
        UPDATE integration_events
        SET status = 'PROCESSED', processed_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = '${workspace_b}'
      `);
    });
    expect(marks_processed, "the worker cannot close another tenant's event").toBe(0);
  });

  it("keeps the payload out of reach of the tenant-less executor", async () => {
    const columns = await client.$queryRaw<
      Array<{ can_read_id: boolean; can_read_workspace: boolean; can_read_raw: boolean }>
    >`
      SELECT
        has_column_privilege('marctco_private_definer', 'public.integration_events', 'id', 'SELECT') AS can_read_id,
        has_column_privilege('marctco_private_definer', 'public.integration_events', 'workspace_id', 'SELECT') AS can_read_workspace,
        has_column_privilege('marctco_private_definer', 'public.integration_events', 'raw', 'SELECT') AS can_read_raw
    `;
    // `raw` holds CPF and phone numbers, and this executor runs with no tenant.
    expect(columns).toEqual([
      { can_read_id: true, can_read_workspace: true, can_read_raw: false }
    ]);
  });

  it("keeps the read-only executor read-only across every business table", async () => {
    // Reusing marctco_private_definer for a third function is only allowed
    // while Seam 3 can prove the same containment (ADR-0019): it reads what its
    // functions need and cannot write anywhere.
    const privileges = await client.$queryRaw<
      Array<{ table_name: string; can_select: boolean; can_write: boolean }>
    >`
      SELECT
        tablename::text AS table_name,
        has_table_privilege('marctco_private_definer', ('public.' || quote_ident(tablename))::regclass, 'SELECT') AS can_select,
        has_table_privilege('marctco_private_definer', ('public.' || quote_ident(tablename))::regclass, 'INSERT')
          OR has_table_privilege('marctco_private_definer', ('public.' || quote_ident(tablename))::regclass, 'UPDATE')
          OR has_table_privilege('marctco_private_definer', ('public.' || quote_ident(tablename))::regclass, 'DELETE') AS can_write
      FROM pg_tables
      WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
      ORDER BY tablename
    `;
    expect(privileges.filter((row) => row.can_write)).toEqual([]);
    // `integration_events` is deliberately absent: the executor holds a
    // column grant there, not a table one, so it can read `(id, workspace_id)`
    // and never the payload — proved by the column test above.
    expect(
      privileges.filter((row) => row.can_select).map((row) => row.table_name)
    ).toEqual(["integration_connections", "workspace_members", "workspaces"]);
  });

  it("keeps every provisioning policy attached to a table the function actually writes", async () => {
    const policies = await client.$queryRaw<Array<{ table_name: string; command: string }>>`
      SELECT tablename::text AS table_name, cmd::text AS command
      FROM pg_policies
      WHERE schemaname = 'public'
        AND 'marctco_provisioner' = ANY (roles)
      ORDER BY tablename, cmd
    `;
    expect(policies).toEqual([
      { table_name: "pipelines", command: "INSERT" },
      { table_name: "pipelines", command: "SELECT" },
      { table_name: "stages", command: "INSERT" },
      { table_name: "workspace_members", command: "INSERT" },
      { table_name: "workspace_members", command: "SELECT" },
      { table_name: "workspaces", command: "INSERT" },
      { table_name: "workspaces", command: "SELECT" }
    ]);
  });
});
