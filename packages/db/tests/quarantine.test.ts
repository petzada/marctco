import { randomUUID } from "node:crypto";
import { buildInboundLead, normalize, readLeadPayload } from "@marctco/domain";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
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
import { getQuarantinedEvent, listQuarantinedEvents } from "../src/quarantine.js";

/**
 * The seam ticket 14 exists to prove: "completar e liberar" reaches the funnel
 * through the same named operations the worker's job calls
 * (`apps/worker/src/integration-event-job.ts`) — `recordLeadSubmission` →
 * `resolveIntakeDestination` → `decideAndApplyIntake` — with `now` set to
 * the release instant instead of `received_at`, and reusing the one
 * `IntegrationEvent` that was already quarantined (ADR-0014, ADR-0017).
 */

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
const neighbour_workspace = randomUUID();
const pipeline_id = randomUUID();
const entry_stage_id = randomUUID();
const connection_id = randomUUID();
const manager_user = randomUUID();
const attendant_user = randomUUID();

const RECEIVED_AT = new Date("2026-08-08T12:00:00.000Z");
const RELEASED_AT = new Date("2026-08-11T09:30:00.000Z");

const manager_context: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const attendant_context: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: attendant_user,
  role: "ATTENDANT"
});
const neighbour_context: UserContext = createUserContextFromResolvedMembership({
  workspace_id: neighbour_workspace,
  user_id: randomUUID(),
  role: "MANAGER"
});

interface QuarantinedFixture {
  readonly event_id: string;
  readonly lead_submission_id: string;
  readonly external_lead_id: string;
}

/**
 * Reproduces exactly what the worker's job does for a submission with no
 * contact: record the submission, decide, apply. What comes out is a real
 * `QUARANTINED` event and `lead_submissions` row, the same starting state
 * `getQuarantinedEvent` and the release form see in production.
 */
async function seedQuarantinedLead(raw: Record<string, string>): Promise<QuarantinedFixture> {
  const external_lead_id = `quarantine-${randomUUID()}`;
  const event_id = randomUUID();
  await seeder.integrationEvent.create({
    data: {
      id: event_id,
      workspace_id: workspace,
      integration_connection_id: connection_id,
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
    { kind: "QUARANTINE", lead_submission_id: submission.lead_submission_id, integration_event_id: event_id },
    app
  );
  return { event_id, lead_submission_id: submission.lead_submission_id, external_lead_id };
}

/**
 * The same named operations `apps/web/lib/release-quarantined-lead.ts` runs.
 * Inbound construction stays local because this package cannot import the
 * web adapter; the coordinator is the real `decideAndApplyIntake`.
 * `completion` is what a manager typed while reading the raw payload.
 */
async function releaseQuarantinedLead(
  fixture: QuarantinedFixture,
  completion: { readonly name: string | null; readonly phones: readonly string[]; readonly emails: readonly string[] },
  now: Date
) {
  const quarantined = await getQuarantinedEvent(manager_context, fixture.event_id, app);
  const reading = readLeadPayload(quarantined.raw);
  const inbound = buildInboundLead(
    { ...reading, fields: { ...reading.fields, name: completion.name, phones: completion.phones, emails: completion.emails } },
    { source: quarantined.source, external_lead_id: quarantined.external_lead_id }
  );
  const normalized = normalize(inbound);

  const submission = await recordLeadSubmission(
    manager_context,
    {
      key: { source: quarantined.source, external_lead_id: quarantined.external_lead_id },
      integration_event_id: quarantined.integration_event_id,
      received_at: quarantined.received_at,
      whatsapp_opt_in: inbound.whatsapp_opt_in
    },
    app
  );
  const destination = await resolveIntakeDestination(
    manager_context,
    quarantined.target_pipeline_id,
    app
  );
  const { applied } = await decideAndApplyIntake(
    manager_context,
    {
      normalized,
      submission,
      destination,
      integration_event_id: quarantined.integration_event_id,
      now
    },
    app
  );
  return applied;
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Quarentena" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Quarentena vizinha" }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: pipeline_id,
        workspace_id: workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: entry_stage_id, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.pipeline.create({
      data: {
        workspace_id: neighbour_workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.integrationConnection.create({
      data: {
        id: connection_id,
        workspace_id: workspace,
        provider: "PLUGA",
        token_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        token_last4: "aaaa"
      }
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("getQuarantinedEvent", () => {
  it("returns the raw payload and the submission's committed identity", async () => {
    const fixture = await seedQuarantinedLead({ ad_id: "123", campaign_id: "456" });

    await expect(getQuarantinedEvent(manager_context, fixture.event_id, app)).resolves.toMatchObject({
      integration_event_id: fixture.event_id,
      lead_submission_id: fixture.lead_submission_id,
      raw: { ad_id: "123", campaign_id: "456" },
      provider: "PLUGA",
      source: "META_LEAD_ADS",
      external_lead_id: fixture.external_lead_id
    });
  });

  it("refuses ATTENDANT — only MANAGER and OWNER read the quarantine queue (ADR-0015)", async () => {
    const fixture = await seedQuarantinedLead({});
    await expect(getQuarantinedEvent(attendant_context, fixture.event_id, app)).rejects.toThrow(
      /MANAGER or OWNER/
    );
  });

  it("does not surface another workspace's quarantined event", async () => {
    const fixture = await seedQuarantinedLead({});
    await expect(getQuarantinedEvent(neighbour_context, fixture.event_id, app)).rejects.toThrow(
      /not currently in quarantine/
    );
  });

  it("refuses an event that is no longer the submission's current quarantine", async () => {
    const fixture = await seedQuarantinedLead({});
    await releaseQuarantinedLead(
      fixture,
      { name: "Maria", phones: ["+5511987654321"], emails: [] },
      RELEASED_AT
    );

    await expect(getQuarantinedEvent(manager_context, fixture.event_id, app)).rejects.toThrow(
      /not currently in quarantine/
    );
  });
});

describe("listQuarantinedEvents", () => {
  it("lists a seeded quarantine, oldest first", async () => {
    const fixture = await seedQuarantinedLead({});
    const events = await listQuarantinedEvents(manager_context, { limit: 200 }, app);
    expect(events.map((event) => event.integration_event_id)).toContain(fixture.event_id);
  });

  it("refuses SUPERVISOR and below", async () => {
    await expect(
      listQuarantinedEvents(attendant_context, {}, app)
    ).rejects.toThrow(/MANAGER or OWNER/);
  });
});

describe("completar e liberar — the same path as ingestion, ADR-0017", () => {
  it("reuses the one IntegrationEvent, creates Person + Opportunity, and starts arrived_at at the release instant", async () => {
    const fixture = await seedQuarantinedLead({ ad_id: "789", form_id: "form-1" });
    const events_before = await seeder.integrationEvent.count({ where: { workspace_id: workspace } });

    const applied = await releaseQuarantinedLead(
      fixture,
      { name: "Maria", phones: ["+5511987654321"], emails: ["maria@exemplo.com"] },
      RELEASED_AT
    );

    expect(applied.kind).toBe("NEW_OPPORTUNITY");
    if (applied.kind !== "NEW_OPPORTUNITY") {
      throw new Error("expected the release to create an Opportunity");
    }

    // No second IntegrationEvent for this submission (ADR-0014): the release
    // spent the one that was already there.
    const events_after = await seeder.integrationEvent.count({ where: { workspace_id: workspace } });
    expect(events_after).toBe(events_before);

    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: applied.opportunity_id } })
    ).resolves.toMatchObject({
      arrived_at: RELEASED_AT,
      pipeline_id,
      stage_id: entry_stage_id,
      missing_phone: false
    });

    const released_event = await seeder.integrationEvent.findUniqueOrThrow({
      where: { id: fixture.event_id }
    });
    // The single source of truth flips in the same commit as the card.
    expect(released_event.status).toBe("PROCESSED");
    expect(released_event.processed_at).toBeInstanceOf(Date);
    // The attribution fields that arrived correctly are carried over — only
    // the contact the manager typed replaces what the mapping lost.
    expect(released_event.raw).toMatchObject({ ad_id: "789", form_id: "form-1" });

    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: fixture.lead_submission_id } })
    ).resolves.toMatchObject({
      last_integration_event_id: fixture.event_id,
      opportunity_id: applied.opportunity_id
    });
  });

  it("stays QUARANTINE when the manager submits with neither phone nor e-mail", async () => {
    const fixture = await seedQuarantinedLead({});
    const persons_before = await seeder.person.count({ where: { workspace_id: workspace } });

    const applied = await releaseQuarantinedLead(
      fixture,
      { name: "Sem contato", phones: [], emails: [] },
      RELEASED_AT
    );

    expect(applied.kind).toBe("QUARANTINE");
    await expect(seeder.person.count({ where: { workspace_id: workspace } })).resolves.toBe(
      persons_before
    );
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: fixture.lead_submission_id } })
    ).resolves.toMatchObject({ opportunity_id: null });
    await expect(
      seeder.integrationEvent.findUniqueOrThrow({ where: { id: fixture.event_id } })
    ).resolves.toMatchObject({ status: "QUARANTINED" });
  });
});
