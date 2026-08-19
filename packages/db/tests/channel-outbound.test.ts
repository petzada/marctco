import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  CHANNEL_OUTBOUND_DISPATCH_LEASE_MS,
  CHANNEL_OUTBOUND_PROCESSING_LEASE_MS
} from "@marctco/domain";
import {
  createJobContext,
  createUserContextFromResolvedMembership
} from "../src/access-context.js";
import { completeActivity, createActivity } from "../src/activities.js";
import {
  ChannelOutboundError,
  acceptChannelOutboundAttempt,
  beginChannelOutboundAttempt,
  claimPendingChannelAttempts,
  dispatchChannelOutboundAttempt,
  failChannelOutboundAttempt,
  getChannelOutboundAttempt,
  loadChannelOutboundSend,
  planAndRecordChannelOutboundAttempt,
  type PlanChannelOutboundAttemptInput
} from "../src/channel-outbound.js";
import { listLeadTimeline } from "../src/lead-timeline.js";

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
const attendant_user = randomUUID();
const manager_user = randomUUID();

const manager = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const attendant = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: attendant_user,
  role: "ATTENDANT"
});

let arrival_clock = new Date("2026-08-19T12:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedOpportunity(options: {
  readonly assigned_user_id?: string | null;
  readonly status?: "OPEN" | "WON" | "LOST";
} = {}): Promise<string> {
  const person = await seeder.person.create({
    data: { workspace_id: workspace, name: "Lead de canal" }
  });
  const status = options.status ?? "OPEN";
  const arrived_at = nextArrival();
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id: workspace,
      person_id: person.id,
      pipeline_id: pipeline,
      stage_id: entry_stage,
      area: "COMMERCIAL",
      status,
      arrived_at,
      closed_at: status === "OPEN" ? null : new Date(arrived_at.getTime() + 60_000),
      assigned_user_id:
        options.assigned_user_id === undefined ? attendant_user : options.assigned_user_id
    }
  });
  return opportunity.id;
}

function eligiblePlan(
  opportunity_id: string,
  overrides: Partial<PlanChannelOutboundAttemptInput> = {}
): PlanChannelOutboundAttemptInput {
  return {
    opportunity_id,
    occurred_trigger: "ON_ASSIGNMENT",
    feature_flag_enabled: true,
    trigger: "ON_ASSIGNMENT",
    whatsapp_opt_in: true,
    missing_phone: false,
    status: "OPEN",
    merged: false,
    pairing_state: "CONNECTED",
    attendant_phone_present: true,
    ...overrides
  };
}

function outboundJob(attempt_id: string) {
  return createJobContext({
    workspace_id: workspace,
    origin: { type: "channel_outbound", attempt_id }
  });
}

async function firstContactAt(opportunity_id: string): Promise<Date | null> {
  const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
  return row.first_contact_at;
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Canal outbound" }
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
    await transaction.workspaceMember.createMany({
      data: [
        {
          workspace_id: workspace,
          user_id: manager_user,
          role: "MANAGER",
          display_name: "Marina Gestão"
        },
        {
          workspace_id: workspace,
          user_id: attendant_user,
          role: "ATTENDANT",
          display_name: "Ana Atendente"
        }
      ]
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: workspace } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("planAndRecordChannelOutboundAttempt", () => {
  it("does not create an intention when flag, trigger, opt-in or eligibility fail", async () => {
    const opportunity_id = await seedOpportunity();
    const refusals: Array<Partial<PlanChannelOutboundAttemptInput>> = [
      { feature_flag_enabled: false },
      { trigger: "DISABLED" },
      { trigger: "ON_ARRIVAL" },
      { whatsapp_opt_in: null },
      { whatsapp_opt_in: false },
      { missing_phone: true },
      { status: "LOST" },
      { merged: true }
    ];
    for (const override of refusals) {
      const result = await planAndRecordChannelOutboundAttempt(
        manager,
        eligiblePlan(opportunity_id, override),
        app
      );
      expect(result.kind).toBe("NONE");
    }
    expect(
      await seeder.channelOutboundAttempt.count({ where: { opportunity_id } })
    ).toBe(0);
  });

  it("records a terminal FAILED attempt when the instance is disconnected or the attendant has no phone", async () => {
    const disconnected = await seedOpportunity();
    const no_phone = await seedOpportunity();
    await expect(
      planAndRecordChannelOutboundAttempt(
        manager,
        eligiblePlan(disconnected, { pairing_state: "DISCONNECTED" }),
        app
      )
    ).resolves.toMatchObject({
      kind: "FAILED",
      reason: "INSTANCE_NOT_CONNECTED"
    });
    await expect(
      planAndRecordChannelOutboundAttempt(
        manager,
        eligiblePlan(no_phone, { attendant_phone_present: false }),
        app
      )
    ).resolves.toMatchObject({
      kind: "FAILED",
      reason: "ATTENDANT_PHONE_MISSING"
    });
    expect(await firstContactAt(disconnected)).toBeNull();
    expect(await firstContactAt(no_phone)).toBeNull();
    const timeline = await listLeadTimeline(manager, disconnected, {}, app);
    expect(timeline.facts.filter((fact) => fact.type === "WHATSAPP_OUTBOUND_FAILED")).toHaveLength(
      1
    );
  });

  it("queues a single pending attempt and refuses a second plan for the same Opportunity", async () => {
    const opportunity_id = await seedOpportunity();
    const first = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(first).toMatchObject({ kind: "QUEUED" });
    const second = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(second).toEqual({ kind: "NONE", reason: "ALREADY_ATTEMPTED" });
    expect(
      await seeder.channelOutboundAttempt.count({ where: { opportunity_id } })
    ).toBe(1);
  });

  it("lets the unique constraint arbitrate two concurrent plans", async () => {
    const opportunity_id = await seedOpportunity();
    const settled = await Promise.allSettled([
      planAndRecordChannelOutboundAttempt(manager, eligiblePlan(opportunity_id), app),
      planAndRecordChannelOutboundAttempt(manager, eligiblePlan(opportunity_id), app)
    ]);
    const values = settled.flatMap((result) =>
      result.status === "fulfilled" ? [result.value] : []
    );
    expect(values).toHaveLength(2);
    expect(values.filter((result) => result.kind === "QUEUED")).toHaveLength(1);
    expect(values.filter((result) => result.kind === "NONE")).toHaveLength(1);
    expect(
      await seeder.channelOutboundAttempt.count({ where: { opportunity_id } })
    ).toBe(1);
  });
});

describe("claimPendingChannelAttempts", () => {
  it("recovers a publication lease after it expires and never returns PII", async () => {
    const opportunity_id = await seedOpportunity();
    const planned = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(planned.kind).toBe("QUEUED");
    if (planned.kind !== "QUEUED") {
      return;
    }
    const t0 = new Date("2026-08-19T15:00:00.000Z");
    const first = await claimPendingChannelAttempts(50, t0, app);
    const claimed = first.find((row) => row.attempt_id === planned.attempt_id);
    expect(claimed).toEqual({ attempt_id: planned.attempt_id, workspace_id: workspace });
    expect(Object.keys(claimed ?? {}).sort()).toEqual(["attempt_id", "workspace_id"]);

    const still_held = await claimPendingChannelAttempts(
      50,
      new Date(t0.getTime() + CHANNEL_OUTBOUND_DISPATCH_LEASE_MS - 1_000),
      app
    );
    expect(still_held.some((row) => row.attempt_id === planned.attempt_id)).toBe(false);

    const recovered = await claimPendingChannelAttempts(
      50,
      new Date(t0.getTime() + CHANNEL_OUTBOUND_DISPATCH_LEASE_MS + 1_000),
      app
    );
    expect(recovered.some((row) => row.attempt_id === planned.attempt_id)).toBe(true);
  });

  it("turns an expired PROCESSING lease into FAILED and does not return it to the queue", async () => {
    const opportunity_id = await seedOpportunity();
    const planned = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(planned.kind).toBe("QUEUED");
    if (planned.kind !== "QUEUED") {
      return;
    }
    const job = outboundJob(planned.attempt_id);
    const t0 = new Date("2026-08-19T16:00:00.000Z");
    await claimPendingChannelAttempts(50, t0, app);
    await dispatchChannelOutboundAttempt(job, t0, app);
    await beginChannelOutboundAttempt(job, t0, app);

    const expired_at = new Date(t0.getTime() + CHANNEL_OUTBOUND_PROCESSING_LEASE_MS + 1_000);
    const claimed = await claimPendingChannelAttempts(50, expired_at, app);
    expect(claimed.some((row) => row.attempt_id === planned.attempt_id)).toBe(false);

    const stored = await getChannelOutboundAttempt(job, app);
    expect(stored).toMatchObject({
      delivery_status: "FAILED",
      failure_reason: "UNCERTAIN_EXTERNAL",
      dispatch_status: "DISPATCHED"
    });
    expect(await firstContactAt(opportunity_id)).toBeNull();

    const timeline = await listLeadTimeline(manager, opportunity_id, {}, app);
    const failed = timeline.facts.filter((fact) => fact.type === "WHATSAPP_OUTBOUND_FAILED");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.occurred_at.toISOString()).toBe(expired_at.toISOString());

    const again = await claimPendingChannelAttempts(50, expired_at, app);
    expect(again.some((row) => row.attempt_id === planned.attempt_id)).toBe(false);
    expect(
      (await listLeadTimeline(manager, opportunity_id, {}, app)).facts.filter(
        (fact) => fact.type === "WHATSAPP_OUTBOUND_FAILED"
      )
    ).toHaveLength(1);
  });
});

describe("channel outbound transitions", () => {
  it("refuses an invalid transition and a second send after PROCESSING", async () => {
    const opportunity_id = await seedOpportunity();
    const planned = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(planned.kind).toBe("QUEUED");
    if (planned.kind !== "QUEUED") {
      return;
    }
    const job = outboundJob(planned.attempt_id);
    await expect(beginChannelOutboundAttempt(job, new Date(), app)).rejects.toBeInstanceOf(
      ChannelOutboundError
    );
    await expect(beginChannelOutboundAttempt(job, new Date(), app)).rejects.toMatchObject({
      reason: "INVALID_TRANSITION"
    });

    const t0 = new Date("2026-08-19T17:00:00.000Z");
    await claimPendingChannelAttempts(50, t0, app);
    await dispatchChannelOutboundAttempt(job, t0, app);
    await beginChannelOutboundAttempt(job, t0, app);
    await failChannelOutboundAttempt(job, { reason: "KNOWN_REFUSAL", now: t0 }, app);
    await expect(dispatchChannelOutboundAttempt(job, t0, app)).rejects.toMatchObject({
      reason: "ALREADY_TERMINAL"
    });
    expect(await firstContactAt(opportunity_id)).toBeNull();
    expect(
      (await listLeadTimeline(manager, opportunity_id, {}, app)).facts.filter(
        (fact) => fact.type === "WHATSAPP_OUTBOUND_FAILED"
      )
    ).toHaveLength(1);
  });

  it("stamps SENT, the timeline fact and first_contact_at at the HTTP 2xx instant, once", async () => {
    const opportunity_id = await seedOpportunity();
    const planned = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(planned.kind).toBe("QUEUED");
    if (planned.kind !== "QUEUED") {
      return;
    }
    const job = outboundJob(planned.attempt_id);
    const t0 = new Date("2026-08-19T18:00:00.000Z");
    const accepted_at = new Date("2026-08-19T18:00:30.000Z");
    await claimPendingChannelAttempts(50, t0, app);
    await dispatchChannelOutboundAttempt(job, t0, app);
    await beginChannelOutboundAttempt(job, t0, app);
    const sent = await acceptChannelOutboundAttempt(job, { accepted_at }, app);
    expect(sent.delivery_status).toBe("SENT");
    expect(sent.sent_at?.toISOString()).toBe(accepted_at.toISOString());
    expect(sent.provider_message_id).toBeNull();
    expect((await firstContactAt(opportunity_id))?.toISOString()).toBe(accepted_at.toISOString());

    const timeline = await listLeadTimeline(manager, opportunity_id, {}, app);
    const fact = timeline.facts.find((row) => row.type === "WHATSAPP_OUTBOUND_SENT");
    expect(fact?.occurred_at.toISOString()).toBe(accepted_at.toISOString());
    expect(timeline.facts.filter((row) => row.type === "WHATSAPP_OUTBOUND_SENT")).toHaveLength(1);
    expect(timeline.facts.filter((row) => row.type === "WHATSAPP_OUTBOUND_FAILED")).toHaveLength(0);

    await expect(acceptChannelOutboundAttempt(job, { accepted_at }, app)).rejects.toMatchObject({
      reason: "ALREADY_TERMINAL"
    });
    expect((await firstContactAt(opportunity_id))?.toISOString()).toBe(accepted_at.toISOString());
  });

  it("lets first_contact_at stay with whoever arrived first between SENT and a completed Activity", async () => {
    const opportunity_id = await seedOpportunity();
    const planned = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(planned.kind).toBe("QUEUED");
    if (planned.kind !== "QUEUED") {
      return;
    }
    const job = outboundJob(planned.attempt_id);
    const t0 = new Date("2026-08-19T19:00:00.000Z");
    await claimPendingChannelAttempts(50, t0, app);
    await dispatchChannelOutboundAttempt(job, t0, app);
    await beginChannelOutboundAttempt(job, t0, app);
    const activity = await createActivity(
      attendant,
      {
        opportunity_id,
        type: "CALL",
        title: "Ligação concorrente",
        due_at: new Date(t0.getTime() + 60_000)
      },
      app
    );

    const settled = await Promise.allSettled([
      acceptChannelOutboundAttempt(job, { accepted_at: new Date(t0.getTime() + 30_000) }, app),
      completeActivity(attendant, activity.id, app)
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
    expect(stored.first_contact_at).not.toBeNull();
    const sent = await getChannelOutboundAttempt(job, app);
    expect(sent?.delivery_status).toBe("SENT");
    expect(activity.id).toBe(activity.id);
    const done = await seeder.activity.findUniqueOrThrow({ where: { id: activity.id } });
    expect(done.status).toBe("DONE");
    const candidates = [sent?.sent_at?.getTime(), done.completed_at?.getTime()].filter(
      (value): value is number => value !== undefined
    );
    expect(candidates).toContain(stored.first_contact_at?.getTime());
  });
});

describe("loadChannelOutboundSend", () => {
  it("loads instance, phones and template values for the job's workspace", async () => {
    const opportunity_id = await seedOpportunity();
    const opportunity = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
    await seeder.personPhone.create({
      data: {
        workspace_id: workspace,
        person_id: opportunity.person_id,
        phone_e164: "+5511987654321"
      }
    });
    await seeder.workspaceMember.update({
      where: {
        workspace_id_user_id: { workspace_id: workspace, user_id: attendant_user }
      },
      data: { whatsapp_phone_e164: "+5511912345678" }
    });
    await seeder.integrationConnection.create({
      data: {
        workspace_id: workspace,
        provider: "WHATSMIAU",
        token_hash: "c".repeat(64),
        token_last4: "abcd",
        instance_name: `marctco_${workspace.replaceAll("-", "")}`,
        pairing_state: "CONNECTED"
      }
    });
    const planned = await planAndRecordChannelOutboundAttempt(
      manager,
      eligiblePlan(opportunity_id),
      app
    );
    expect(planned.kind).toBe("QUEUED");
    if (planned.kind !== "QUEUED") {
      return;
    }

    const payload = await loadChannelOutboundSend(outboundJob(planned.attempt_id), app);
    expect(payload).toMatchObject({
      instance_name: `marctco_${workspace.replaceAll("-", "")}`,
      pairing_state: "CONNECTED",
      destination_e164: "+5511987654321",
      lead_name: "Lead de canal",
      workspace_name: "Canal outbound",
      attendant_name: "Ana Atendente",
      attendant_phone_e164: "+5511912345678"
    });
    expect(payload && Object.keys(payload).sort()).toEqual([
      "attendant_name",
      "attendant_phone_e164",
      "destination_e164",
      "instance_name",
      "lead_name",
      "pairing_state",
      "template_body",
      "trigger",
      "workspace_name"
    ]);
  });
});
