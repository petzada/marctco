import { randomUUID } from "node:crypto";
import { buildInboundLead, normalize, readLeadPayload } from "@marctco/domain";
import { PrismaClient } from "@prisma/client";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import {
  createJobContext,
  createUserContextFromResolvedMembership,
  type UserContext
} from "../src/access-context.js";
import {
  applyIntakePlan,
  decideAndApplyIntake,
  recordLeadSubmission,
  resolveIntakeDestination
} from "../src/intake.js";
import { getQuarantinedEvent } from "../src/quarantine.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

function appRoleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c role=marctco_app");
  return parsed.toString();
}

const seeder = new PrismaClient({ datasources: { db: { url: database_url } } });
const app = new PrismaClient({ datasources: { db: { url: appRoleUrl(database_url) } } });

const workspace = randomUUID();
const pipeline = randomUUID();
const entry_stage = randomUUID();
const pluga_connection = randomUUID();
const manager_user = randomUUID();

const manager: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});

const RECEIVED_AT = new Date("2026-08-19T16:00:00.000Z");
const RELEASED_AT = new Date("2026-08-19T18:30:00.000Z");

async function restoreWorkspaceDefaults() {
  await seeder.workspaceFlag.upsert({
    where: {
      workspace_id_key: { workspace_id: workspace, key: "auto_primeiro_contato" }
    },
    create: { workspace_id: workspace, key: "auto_primeiro_contato" },
    update: {}
  });
  await seeder.workspaceSettings.deleteMany({ where: { workspace_id: workspace } });
  await seeder.integrationConnection.updateMany({
    where: { workspace_id: workspace, provider: "WHATSMIAU" },
    data: { pairing_state: "CONNECTED", status: "ACTIVE" }
  });
}

async function setTrigger(first_contact_trigger: "ON_ARRIVAL" | "ON_ASSIGNMENT" | "DISABLED") {
  await seeder.workspaceSettings.create({
    data:
      first_contact_trigger === "ON_ARRIVAL"
        ? {
            workspace_id: workspace,
            first_contact_trigger,
            first_contact_template_body: "Olá {{lead_name}}, aqui é a {{workspace_name}}."
          }
        : { workspace_id: workspace, first_contact_trigger }
  });
}

interface Ingested {
  readonly opportunity_id: string;
  readonly post_creation_effects: readonly { readonly kind: string; readonly opportunity_id: string }[];
}

async function ingestLead(options: {
  readonly whatsapp_opt_in?: boolean | null;
  readonly phone?: string;
  readonly email?: string;
}): Promise<Ingested> {
  const event_id = randomUUID();
  await seeder.integrationEvent.create({
    data: {
      id: event_id,
      workspace_id: workspace,
      integration_connection_id: pluga_connection,
      raw: { name: "Lead de chegada" },
      received_at: RECEIVED_AT
    }
  });
  const job = createJobContext({ workspace_id: workspace, integration_event_id: event_id });
  const inbound = buildInboundLead(
    readLeadPayload({
      name: "Lead de chegada",
      phone: options.phone ?? "11987654321",
      email: options.email,
      whatsapp_opt_in: options.whatsapp_opt_in === undefined ? true : options.whatsapp_opt_in
    }),
    { source: "META_LEAD_ADS", external_lead_id: `arrival-${event_id}` }
  );
  const normalized = normalize(inbound);
  const submission = await recordLeadSubmission(
    job,
    {
      key: { source: "META_LEAD_ADS", external_lead_id: `arrival-${event_id}` },
      integration_event_id: event_id,
      received_at: RECEIVED_AT,
      whatsapp_opt_in: inbound.whatsapp_opt_in
    },
    app
  );
  const destination = await resolveIntakeDestination(job, null, app);
  const decided = await decideAndApplyIntake(
    job,
    {
      normalized,
      submission,
      destination,
      integration_event_id: event_id,
      now: RECEIVED_AT
    },
    app
  );
  if (decided.applied.kind !== "NEW_OPPORTUNITY") {
    throw new Error(`expected a new Opportunity, got ${decided.applied.kind}`);
  }
  return {
    opportunity_id: decided.applied.opportunity_id,
    post_creation_effects: decided.post_creation_effects
  };
}

async function attemptsOf(opportunity_id: string) {
  return seeder.channelOutboundAttempt.findMany({
    where: { opportunity_id },
    orderBy: { created_at: "asc" }
  });
}

async function firstContactAt(opportunity_id: string): Promise<Date | null> {
  const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
  return row.first_contact_at;
}

interface QuarantinedFixture {
  readonly event_id: string;
  readonly lead_submission_id: string;
  readonly external_lead_id: string;
}

async function seedQuarantinedLead(
  raw: { readonly whatsapp_opt_in?: boolean } = {}
): Promise<QuarantinedFixture> {
  const external_lead_id = `quarantine-arrival-${randomUUID()}`;
  const event_id = randomUUID();
  await seeder.integrationEvent.create({
    data: {
      id: event_id,
      workspace_id: workspace,
      integration_connection_id: pluga_connection,
      raw,
      received_at: RECEIVED_AT
    }
  });
  const job = createJobContext({ workspace_id: workspace, integration_event_id: event_id });
  const submission = await recordLeadSubmission(
    job,
    {
      key: { source: "META_LEAD_ADS", external_lead_id },
      integration_event_id: event_id,
      received_at: RECEIVED_AT,
      whatsapp_opt_in: null
    },
    app
  );
  await applyIntakePlan(
    job,
    {
      kind: "QUARANTINE",
      lead_submission_id: submission.lead_submission_id,
      integration_event_id: event_id
    },
    app
  );
  return { event_id, lead_submission_id: submission.lead_submission_id, external_lead_id };
}

async function releaseQuarantinedLead(
  fixture: QuarantinedFixture,
  completion: { readonly name: string; readonly phones: readonly string[]; readonly emails: readonly string[] }
) {
  const quarantined = await getQuarantinedEvent(manager, fixture.event_id, app);
  const reading = readLeadPayload(quarantined.raw);
  const inbound = buildInboundLead(
    {
      ...reading,
      fields: {
        ...reading.fields,
        name: completion.name,
        phones: completion.phones,
        emails: completion.emails
      }
    },
    { source: quarantined.source, external_lead_id: quarantined.external_lead_id }
  );
  const normalized = normalize(inbound);
  const submission = await recordLeadSubmission(
    manager,
    {
      key: { source: quarantined.source, external_lead_id: quarantined.external_lead_id },
      integration_event_id: quarantined.integration_event_id,
      received_at: quarantined.received_at,
      whatsapp_opt_in: inbound.whatsapp_opt_in
    },
    app
  );
  const destination = await resolveIntakeDestination(
    manager,
    quarantined.target_pipeline_id,
    app
  );
  const { applied, post_creation_effects } = await decideAndApplyIntake(
    manager,
    {
      normalized,
      submission,
      destination,
      integration_event_id: quarantined.integration_event_id,
      now: RELEASED_AT
    },
    app
  );
  return { applied, post_creation_effects };
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Canal na chegada" }
    });
    await transaction.pipeline.create({
      data: {
        id: pipeline,
        workspace_id: workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: entry_stage, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.workspaceMember.create({
      data: {
        workspace_id: workspace,
        user_id: manager_user,
        role: "MANAGER",
        display_name: "Marina Gestao"
      }
    });
    await transaction.workspaceFlag.create({
      data: { workspace_id: workspace, key: "auto_primeiro_contato" }
    });
    await transaction.integrationConnection.createMany({
      data: [
        {
          id: pluga_connection,
          workspace_id: workspace,
          provider: "PLUGA",
          token_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          token_last4: "aaaa"
        },
        {
          workspace_id: workspace,
          provider: "WHATSMIAU",
          token_hash: "e".repeat(64),
          token_last4: "eeee",
          instance_name: `marctco_${workspace.replaceAll("-", "")}`,
          pairing_state: "CONNECTED"
        }
      ]
    });
  });
});

afterEach(async () => {
  await restoreWorkspaceDefaults();
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: workspace } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("outbound on arrival", () => {
  it("queues one pending attempt in the same apply that creates the Opportunity", async () => {
    await setTrigger("ON_ARRIVAL");
    const ingested = await ingestLead({});

    const attempts = await attemptsOf(ingested.opportunity_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      kind: "AUTO_FIRST_CONTACT",
      dispatch_status: "PENDING",
      delivery_status: "QUEUED",
      failure_reason: null
    });
    expect(await firstContactAt(ingested.opportunity_id)).toBeNull();
    expect(ingested.post_creation_effects).toEqual([
      { kind: "AUTO_FIRST_CONTACT", opportunity_id: ingested.opportunity_id }
    ]);
  });

  it("does not record an attempt under the default ON_ASSIGNMENT trigger", async () => {
    const ingested = await ingestLead({});
    expect(await attemptsOf(ingested.opportunity_id)).toEqual([]);
    expect(ingested.post_creation_effects).toEqual([]);
    expect(await firstContactAt(ingested.opportunity_id)).toBeNull();
  });

  it("creates no intention when the flag is off or the trigger is DISABLED", async () => {
    await seeder.workspaceFlag.delete({
      where: {
        workspace_id_key: { workspace_id: workspace, key: "auto_primeiro_contato" }
      }
    });
    await setTrigger("ON_ARRIVAL");
    const without_flag = await ingestLead({});
    expect(await attemptsOf(without_flag.opportunity_id)).toEqual([]);

    await restoreWorkspaceDefaults();
    await setTrigger("DISABLED");
    const disabled = await ingestLead({});
    expect(await attemptsOf(disabled.opportunity_id)).toEqual([]);
    expect(disabled.post_creation_effects).toEqual([]);
  });

  it("fails closed and creates no intention when opt-in is absent or false", async () => {
    await setTrigger("ON_ARRIVAL");
    for (const whatsapp_opt_in of [null, false] as const) {
      const ingested = await ingestLead({ whatsapp_opt_in });
      expect(await attemptsOf(ingested.opportunity_id), String(whatsapp_opt_in)).toEqual([]);
      expect(ingested.post_creation_effects, String(whatsapp_opt_in)).toEqual([]);
      expect(await firstContactAt(ingested.opportunity_id), String(whatsapp_opt_in)).toBeNull();
    }
  });

  it("creates no intention when the lead has no phone", async () => {
    await setTrigger("ON_ARRIVAL");
    const ingested = await ingestLead({ phone: "", email: "lead@exemplo.com" });
    expect(await attemptsOf(ingested.opportunity_id)).toEqual([]);
  });

  it("records a terminal FAILED attempt when the instance is not connected", async () => {
    await setTrigger("ON_ARRIVAL");
    await seeder.integrationConnection.updateMany({
      where: { workspace_id: workspace, provider: "WHATSMIAU" },
      data: { pairing_state: "DISCONNECTED" }
    });
    const ingested = await ingestLead({});
    const attempts = await attemptsOf(ingested.opportunity_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      dispatch_status: "DISPATCHED",
      delivery_status: "FAILED",
      failure_reason: "INSTANCE_NOT_CONNECTED"
    });
    expect(ingested.post_creation_effects).toEqual([
      { kind: "AUTO_FIRST_CONTACT", opportunity_id: ingested.opportunity_id }
    ]);
    expect(await firstContactAt(ingested.opportunity_id)).toBeNull();
    await expect(
      seeder.opportunityTimelineEvent.count({
        where: { opportunity_id: ingested.opportunity_id, type: "WHATSAPP_OUTBOUND_FAILED" }
      })
    ).resolves.toBe(1);
  });

  it("records an attempt when quarantine release creates the Opportunity on ON_ARRIVAL", async () => {
    await setTrigger("ON_ARRIVAL");
    const fixture = await seedQuarantinedLead({ whatsapp_opt_in: true });
    const { applied, post_creation_effects } = await releaseQuarantinedLead(fixture, {
      name: "Maria",
      phones: ["+5511987654321"],
      emails: []
    });
    expect(applied.kind).toBe("NEW_OPPORTUNITY");
    if (applied.kind !== "NEW_OPPORTUNITY") {
      throw new Error("expected the release to create an Opportunity");
    }
    const attempts = await attemptsOf(applied.opportunity_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      kind: "AUTO_FIRST_CONTACT",
      dispatch_status: "PENDING",
      delivery_status: "QUEUED"
    });
    expect(await firstContactAt(applied.opportunity_id)).toBeNull();
    expect(post_creation_effects).toEqual([
      { kind: "AUTO_FIRST_CONTACT", opportunity_id: applied.opportunity_id }
    ]);
  });

  it("does not record an attempt when quarantine release runs under ON_ASSIGNMENT", async () => {
    const fixture = await seedQuarantinedLead({ whatsapp_opt_in: true });
    const { applied, post_creation_effects } = await releaseQuarantinedLead(fixture, {
      name: "Maria",
      phones: ["+5511987654321"],
      emails: []
    });
    expect(applied.kind).toBe("NEW_OPPORTUNITY");
    if (applied.kind !== "NEW_OPPORTUNITY") {
      throw new Error("expected the release to create an Opportunity");
    }
    expect(await attemptsOf(applied.opportunity_id)).toEqual([]);
    expect(post_creation_effects).toEqual([]);
  });
});
