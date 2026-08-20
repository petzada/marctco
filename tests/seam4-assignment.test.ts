import { randomUUID } from "node:crypto";
import {
  attachWorkspaceMember,
  assignLeads,
  completeActivity,
  createActivity,
  createIntegrationConnection,
  createJobContext,
  createWhatsAppConnection,
  decideAndApplyIntake,
  getLead,
  provisionWorkspace,
  reassignLeads,
  recordIntegrationEvent,
  recordLeadSubmission,
  resolveIntakeDestination,
  resolveIntakeReview,
  resolveUserContextForSlug,
  setWhatsAppPairingState,
  updateWorkspaceSettings,
  WorkspaceSettingsWriteError,
  type UserContext
} from "@marctco/db";
import {
  buildInboundLead,
  CHANNEL_OUTBOUND_INITIAL_DELAY_MS,
  CHANNEL_OUTBOUND_JOB,
  CHANNEL_OUTBOUND_QUEUE,
  CHANNEL_OUTBOUND_RATE_LIMIT_MAX,
  CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS,
  channelOutboundJobId,
  createMemoryRateLimiter,
  normalize,
  readLeadPayload
} from "@marctco/domain";
import { Queue, Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import {
  dispatchPendingChannelAttempts,
  type ChannelJobPublisher
} from "../apps/web/lib/channel-dispatcher";
import {
  finishChannelOutboundWorkerJob,
  processChannelOutboundJob
} from "../apps/worker/src/channel-outbound-job";
import {
  closeSeamInspection,
  expireChannelDispatchLeases,
  inspectCards,
  inspectMessageFacts,
  inspectOutboundAttempts,
  inspectPendingDuplicateReviews,
  seedRejectedFirstContactTemplate,
  seedWorkspaceFeatureFlag
} from "../packages/db/tests/seam-inspection";

const redis_url = process.env.REDIS_URL;
if (!redis_url) {
  throw new Error("Seam 4 needs a real REDIS_URL");
}

const ATTENDANT_PHONE = "11912345678";
const OTHER_ATTENDANT_PHONE = "11988887777";
const LEAD_PHONE = "11987654321";
const TEAM_TAG = "ACR";
const JOB_ATTEMPTS = 5;

type SendTextResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "http_error"; readonly status: number }
  | { readonly kind: "timeout" };

type SendText = (input: {
  readonly instance_name: string;
  readonly number: string;
  readonly text: string;
}) => Promise<SendTextResult>;

const redis = new IORedis(redis_url, { maxRetriesPerRequest: null });
const bull_connection = new IORedis(redis_url, { maxRetriesPerRequest: null });
const worker_connection = new IORedis(redis_url, { maxRetriesPerRequest: null });
const bull = new Queue(CHANNEL_OUTBOUND_QUEUE, { connection: bull_connection });

/**
 * Same add options as `createChannelOutboundQueue` (ticket owns tests, not the
 * queue module). One Queue instance both publishes and promotes, so getJob
 * cannot miss a job another Redis client just wrote.
 */
const publisher: ChannelJobPublisher = {
  async publish(job_id, data) {
    await bull.remove(job_id).catch(() => undefined);
    await bull.add(CHANNEL_OUTBOUND_JOB, data, {
      jobId: job_id,
      delay: CHANNEL_OUTBOUND_INITIAL_DELAY_MS,
      attempts: JOB_ATTEMPTS,
      backoff: { type: "exponential", delay: 1_000 },
      removeOnComplete: { age: 86_400, count: 1_000 },
      removeOnFail: false
    });
  }
};

interface SeededChannelWorkspace {
  readonly workspace_id: string;
  readonly workspace_name: string;
  readonly slug: string;
  readonly owner: UserContext;
  readonly manager: UserContext;
  readonly supervisor: UserContext;
  readonly attendant: UserContext;
  readonly other_attendant: UserContext;
  readonly pluga_token: string;
}

async function resolveContext(user_id: string, slug: string): Promise<UserContext> {
  const resolved = await resolveUserContextForSlug(user_id, slug);
  if (!resolved) {
    throw new Error("the provisioned member did not resolve for its slug");
  }
  return resolved.context;
}

async function seedReadyWorkspace(
  workspace_name: string,
  options: { readonly enable_flag?: boolean; readonly connect_whatsapp?: boolean } = {}
): Promise<SeededChannelWorkspace> {
  const owner_user_id = randomUUID();
  const manager_user_id = randomUUID();
  const supervisor_user_id = randomUUID();
  const attendant_user_id = randomUUID();
  const other_attendant_user_id = randomUUID();
  const suffix = randomUUID().slice(0, 8);
  const provisioned = await provisionWorkspace({ owner_user_id, workspace_name });
  const owner = await resolveContext(owner_user_id, provisioned.slug);

  await attachWorkspaceMember(owner, {
    user_id: manager_user_id,
    display_name: "Marina Gestao",
    email: `marina-${suffix}@exemplo.com`,
    role: "MANAGER",
    tags: []
  });
  await attachWorkspaceMember(owner, {
    user_id: supervisor_user_id,
    display_name: "Sofia Supervisora",
    email: `sofia-${suffix}@exemplo.com`,
    role: "SUPERVISOR",
    tags: [TEAM_TAG]
  });
  await attachWorkspaceMember(owner, {
    user_id: attendant_user_id,
    display_name: "Ana Atendente",
    email: `ana-${suffix}@exemplo.com`,
    role: "ATTENDANT",
    tags: [TEAM_TAG],
    whatsapp_phone: ATTENDANT_PHONE
  });
  await attachWorkspaceMember(owner, {
    user_id: other_attendant_user_id,
    display_name: "Bia Atendente",
    email: `bia-${suffix}@exemplo.com`,
    role: "ATTENDANT",
    tags: [TEAM_TAG],
    whatsapp_phone: OTHER_ATTENDANT_PHONE
  });

  await createWhatsAppConnection(owner);
  if (options.connect_whatsapp !== false) {
    await setWhatsAppPairingState(owner, "CONNECTED");
  }
  const pluga = await createIntegrationConnection(owner, { provider: "PLUGA" });
  if (options.enable_flag !== false) {
    await seedWorkspaceFeatureFlag(provisioned.workspace_id, "auto_primeiro_contato");
  }

  return {
    workspace_id: provisioned.workspace_id,
    workspace_name,
    slug: provisioned.slug,
    owner,
    manager: await resolveContext(manager_user_id, provisioned.slug),
    supervisor: await resolveContext(supervisor_user_id, provisioned.slug),
    attendant: await resolveContext(attendant_user_id, provisioned.slug),
    other_attendant: await resolveContext(other_attendant_user_id, provisioned.slug),
    pluga_token: pluga.token
  };
}

async function ingestLead(
  tenant: SeededChannelWorkspace,
  options: {
    readonly name?: string;
    readonly phone?: string;
    readonly email?: string;
    readonly whatsapp_opt_in?: boolean | null;
    readonly received_at?: Date;
  } = {}
): Promise<string> {
  const received_at = options.received_at ?? new Date("2026-08-20T12:00:00.000Z");
  const recorded = await recordIntegrationEvent({
    workspace_id: tenant.workspace_id,
    token: tenant.pluga_token,
    raw: { name: options.name ?? "Maria Souza" }
  });
  const job = createJobContext({
    workspace_id: tenant.workspace_id,
    integration_event_id: recorded.integration_event_id
  });
  const inbound = buildInboundLead(
    readLeadPayload({
      name: options.name ?? "Maria Souza",
      phone: options.phone,
      email: options.email,
      whatsapp_opt_in: options.whatsapp_opt_in === undefined ? true : options.whatsapp_opt_in
    }),
    { source: "META_LEAD_ADS", external_lead_id: `seam4-${recorded.integration_event_id}` }
  );
  const normalized = normalize(inbound);
  const submission = await recordLeadSubmission(job, {
    key: { source: "META_LEAD_ADS", external_lead_id: `seam4-${recorded.integration_event_id}` },
    integration_event_id: recorded.integration_event_id,
    received_at,
    whatsapp_opt_in: inbound.whatsapp_opt_in
  });
  const destination = await resolveIntakeDestination(job, null);
  const decided = await decideAndApplyIntake(job, {
    normalized,
    submission,
    destination,
    integration_event_id: recorded.integration_event_id,
    now: received_at
  });
  if (decided.applied.kind !== "NEW_OPPORTUNITY") {
    throw new Error(`expected a new Opportunity, got ${decided.applied.kind}`);
  }
  return decided.applied.opportunity_id;
}

async function assignToSupervisor(tenant: SeededChannelWorkspace, opportunity_id: string) {
  return assignLeads(tenant.manager, {
    opportunity_ids: [opportunity_id],
    user_id: tenant.supervisor.user_id
  });
}

async function reassignToAttendant(
  tenant: SeededChannelWorkspace,
  opportunity_id: string,
  destination_user_id: string = tenant.attendant.user_id
) {
  return reassignLeads(tenant.supervisor, {
    assignments: [{ opportunity_id, current_user_id: tenant.supervisor.user_id }],
    user_id: destination_user_id
  });
}

function jobKey(attempt_id: string): string {
  return `bull:${CHANNEL_OUTBOUND_QUEUE}:${channelOutboundJobId(attempt_id)}`;
}

async function waitForJob(attempt_id: string): Promise<Job> {
  const job_id = channelOutboundJobId(attempt_id);
  return vi.waitFor(
    async () => {
      const job = await bull.getJob(job_id);
      if (!job) {
        throw new Error(`expected channel job ${job_id} in Redis`);
      }
      return job;
    },
    { timeout: 10_000, interval: 100 }
  );
}

async function promoteAttempt(attempt_id: string): Promise<void> {
  const job = await waitForJob(attempt_id);
  const state = await job.getState();
  if (state === "delayed") {
    await job.promote();
    return;
  }
  if (state === "waiting" || state === "active") {
    return;
  }
  throw new Error(`channel job ${attempt_id} is ${state}, not delayed`);
}

async function dispatchAndPromote(attempt_ids: readonly string[]): Promise<void> {
  const outcome = await dispatchPendingChannelAttempts(publisher, 100);
  expect(outcome.dispatched).toBe(outcome.claimed);
  expect(outcome.claimed).toBeGreaterThanOrEqual(attempt_ids.length);
  for (const attempt_id of attempt_ids) {
    await promoteAttempt(attempt_id);
  }
}

function startChannelWorker(
  sendText: SendText,
  workspace_ids: readonly string[],
  rateLimiter?: ReturnType<typeof createMemoryRateLimiter>
): Worker {
  const allowed = new Set(workspace_ids);
  return new Worker(
    CHANNEL_OUTBOUND_QUEUE,
    async (job: Job, token?: string) => {
      const data = job.data as { attempt_id: string; workspace_id: string };
      if (!allowed.has(data.workspace_id)) {
        return { attempt_id: data.attempt_id, workspace_id: data.workspace_id, outcome: "skipped" };
      }
      const processed = await processChannelOutboundJob(data, {
        provider: { sendText },
        rateLimiter
      });
      return finishChannelOutboundWorkerJob(job, token, processed);
    },
    { connection: worker_connection, concurrency: 8 }
  );
}

async function runChannelWorker(
  sendText: SendText,
  workspace_ids: readonly string[],
  until: () => Promise<void>,
  rateLimiter?: ReturnType<typeof createMemoryRateLimiter>
): Promise<Worker> {
  const worker = startChannelWorker(sendText, workspace_ids, rateLimiter);
  try {
    await vi.waitFor(until, { timeout: 30_000, interval: 250 });
  } catch (error) {
    await worker.close(true);
    throw error;
  }
  return worker;
}

afterAll(async () => {
  await bull.close();
  bull_connection.disconnect();
  worker_connection.disconnect();
  await redis.quit();
  await closeSeamInspection();
});

beforeAll(async () => {
  await Promise.all([bull.waitUntilReady(), redis.ping(), worker_connection.ping()]);
});

describe("Seam 4: dispatcher, fake WhatsMiau, SENT fact and first_contact_at", () => {
  it("delivers Gestao→Supervisor without a send, then Supervisor→Attendant through one sendText", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 evidência ${randomUUID()}`);
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE, name: "Maria Souza" });
    const sendText = vi.fn<SendText>().mockResolvedValue({ kind: "accepted" });

    const queued = await assignToSupervisor(tenant, opportunity_id);
    expect(queued.assigned).toEqual([
      { opportunity_id, assigned_user_id: tenant.supervisor.user_id }
    ]);
    await expect(inspectOutboundAttempts(tenant.workspace_id, opportunity_id)).resolves.toEqual([]);
    const [supervisor_card] = await inspectCards(tenant.workspace_id);
    expect(supervisor_card?.first_contact_at).toBeNull();
    expect(supervisor_card?.assigned_user_id).toBe(tenant.supervisor.user_id);

    const delivered = await reassignToAttendant(tenant, opportunity_id);
    expect(delivered.assigned).toEqual([
      { opportunity_id, assigned_user_id: tenant.attendant.user_id }
    ]);
    const attempts = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0]).toMatchObject({
      opportunity_id,
      kind: "AUTO_FIRST_CONTACT",
      dispatch_status: "PENDING",
      delivery_status: "QUEUED",
      failure_reason: null,
      dispatched_at: null,
      sent_at: null
    });
    const attempt_id = attempts[0]?.id;
    if (!attempt_id) {
      throw new Error("assignment must persist an outbox row in the same commit");
    }
    expect((await inspectCards(tenant.workspace_id))[0]?.first_contact_at).toBeNull();
    expect(await inspectMessageFacts(tenant.workspace_id, opportunity_id)).toEqual([]);

    const outcome = await dispatchPendingChannelAttempts(publisher, 100);
    expect(outcome.dispatched).toBe(outcome.claimed);
    expect(outcome.claimed).toBeGreaterThanOrEqual(1);

    const [dispatched] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    expect(dispatched).toMatchObject({
      id: attempt_id,
      dispatch_status: "DISPATCHED",
      delivery_status: "QUEUED"
    });
    await expect(redis.exists(jobKey(attempt_id))).resolves.toBe(1);
    const job_data = await redis.hget(jobKey(attempt_id), "data");
    const parsed_job: unknown = JSON.parse(job_data ?? "{}");
    expect(parsed_job).toEqual({
      attempt_id,
      workspace_id: tenant.workspace_id
    });
    expect(job_data).not.toContain(LEAD_PHONE);
    expect(job_data).not.toContain(ATTENDANT_PHONE);

    const worker = startChannelWorker(sendText, [tenant.workspace_id]);
    try {
      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(sendText).toHaveBeenCalledTimes(0);
      expect((await inspectCards(tenant.workspace_id))[0]?.first_contact_at).toBeNull();

      await promoteAttempt(attempt_id);
      await vi.waitFor(
        async () => {
          const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
          expect(attempt?.delivery_status).toBe("SENT");
        },
        { timeout: 30_000, interval: 250 }
      );
    } finally {
      await worker.close();
    }

    expect(sendText).toHaveBeenCalledOnce();
    const [sent_payload] = sendText.mock.calls[0] ?? [];
    expect(sent_payload).toMatchObject({
      number: "5511987654321",
      text: `Olá Maria Souza, sou Ana Atendente da ${tenant.workspace_name}. Meu WhatsApp é +5511912345678.`
    });
    expect(sent_payload?.instance_name).toMatch(/^marctco_/);

    const facts = await inspectMessageFacts(tenant.workspace_id, opportunity_id);
    expect(facts).toEqual([
      expect.objectContaining({ type: "WHATSAPP_OUTBOUND_SENT", opportunity_id })
    ]);
    const [card] = await inspectCards(tenant.workspace_id);
    expect(card?.first_contact_at).toBeInstanceOf(Date);
    const lead = await getLead(tenant.attendant, opportunity_id);
    expect(lead.first_contact_at).toEqual(card?.first_contact_at);
    const [outbound] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    expect(outbound?.sent_at).toEqual(card?.first_contact_at);

    await expect(
      processChannelOutboundJob(
        { attempt_id, workspace_id: tenant.workspace_id },
        { provider: { sendText } }
      )
    ).resolves.toMatchObject({ outcome: "skipped" });
    expect(sendText).toHaveBeenCalledOnce();

    const reassigned = await reassignLeads(tenant.supervisor, {
      assignments: [{ opportunity_id, current_user_id: tenant.attendant.user_id }],
      user_id: tenant.other_attendant.user_id
    });
    expect(reassigned.assigned).toEqual([
      { opportunity_id, assigned_user_id: tenant.other_attendant.user_id }
    ]);
    await expect(inspectOutboundAttempts(tenant.workspace_id, opportunity_id)).resolves.toHaveLength(
      1
    );
    await dispatchPendingChannelAttempts(publisher, 100);
    expect(sendText).toHaveBeenCalledOnce();
    expect((await inspectCards(tenant.workspace_id))[0]?.first_contact_at).toEqual(
      card?.first_contact_at
    );
  });
});

describe("Seam 4: outbox recovery before HTTP", () => {
  it("publishes a committed attempt after a failed dispatcher pass, without a second sendText", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 recuperação ${randomUUID()}`);
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE, name: "Maria Souza" });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    const [pending] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    if (!pending) {
      throw new Error("expected a pending attempt after assignment");
    }

    const unreachable = { publish: () => Promise.reject(new Error("ECONNREFUSED")) };
    await expect(dispatchPendingChannelAttempts(unreachable, 100)).resolves.toMatchObject({
      dispatched: 0
    });
    const still_pending = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    expect(still_pending[0]).toMatchObject({
      id: pending.id,
      dispatch_status: "PENDING",
      delivery_status: "QUEUED"
    });
    expect(await inspectCards(tenant.workspace_id)).toMatchObject([{ first_contact_at: null }]);

    // Claim holds a 2-minute publication lease (ticket 03b). The periodic
    // dispatcher recovers after that lease without an operator; the seam
    // advances the clock rather than waiting out the wall-clock window.
    await expireChannelDispatchLeases(tenant.workspace_id);

    const sendText = vi.fn<SendText>().mockResolvedValue({ kind: "accepted" });
    await dispatchAndPromote([pending.id]);
    const worker = await runChannelWorker(sendText, [tenant.workspace_id], async () => {
      const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
      expect(attempt?.delivery_status).toBe("SENT");
    });
    await worker.close();

    expect(sendText).toHaveBeenCalledOnce();
    const facts = await inspectMessageFacts(tenant.workspace_id, opportunity_id);
    expect(facts.map((fact) => fact.type)).toEqual(["WHATSAPP_OUTBOUND_SENT"]);
  });
});

describe("Seam 4: crash after sendText starts does not call the API again", () => {
  it("leaves PROCESSING, then fails as UNCERTAIN_EXTERNAL on the next pass", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 crash ${randomUUID()}`);
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    const [pending] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    if (!pending) {
      throw new Error("expected a pending attempt");
    }

    const sendText = vi.fn<SendText>().mockReturnValue(new Promise<SendTextResult>(() => undefined));
    await dispatchAndPromote([pending.id]);
    const worker = startChannelWorker(sendText, [tenant.workspace_id]);
    try {
      await vi.waitFor(
        async () => {
          expect(sendText).toHaveBeenCalledOnce();
          const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
          expect(attempt?.delivery_status).toBe("PROCESSING");
        },
        { timeout: 30_000, interval: 250 }
      );
    } finally {
      await worker.close(true);
    }
    await bull.remove(channelOutboundJobId(pending.id)).catch(() => undefined);

    await expect(
      processChannelOutboundJob(
        { attempt_id: pending.id, workspace_id: tenant.workspace_id },
        { provider: { sendText } }
      )
    ).resolves.toMatchObject({ outcome: "failed" });

    expect(sendText).toHaveBeenCalledOnce();
    const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    expect(attempt).toMatchObject({
      delivery_status: "FAILED",
      failure_reason: "UNCERTAIN_EXTERNAL"
    });
    const [card] = await inspectCards(tenant.workspace_id);
    expect(card?.first_contact_at).toBeNull();
    expect(await inspectMessageFacts(tenant.workspace_id, opportunity_id)).toEqual([
      expect.objectContaining({ type: "WHATSAPP_OUTBOUND_FAILED", opportunity_id })
    ]);
  });
});

describe("Seam 4: negative variants create no send and no first_contact_at", () => {
  it("creates no intention when the commercial flag is off", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 flag off ${randomUUID()}`, {
      enable_flag: false
    });
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    await expect(inspectOutboundAttempts(tenant.workspace_id, opportunity_id)).resolves.toEqual([]);
    expect((await inspectCards(tenant.workspace_id))[0]?.first_contact_at).toBeNull();
  });

  it("creates no intention when the trigger is DISABLED", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 disabled ${randomUUID()}`);
    await updateWorkspaceSettings(tenant.manager, {
      first_contact_trigger: "DISABLED",
      first_contact_template_body: ""
    });
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    await expect(inspectOutboundAttempts(tenant.workspace_id, opportunity_id)).resolves.toEqual([]);
  });

  it("creates no intention when opt-in is absent or false", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 opt-in ${randomUUID()}`);
    for (const whatsapp_opt_in of [null, false] as const) {
      const opportunity_id = await ingestLead(tenant, {
        phone: whatsapp_opt_in === null ? "11970001111" : "11970002222",
        name: `Opt-in ${String(whatsapp_opt_in)}`,
        whatsapp_opt_in
      });
      await assignToSupervisor(tenant, opportunity_id);
      await reassignToAttendant(tenant, opportunity_id);
      await expect(inspectOutboundAttempts(tenant.workspace_id, opportunity_id)).resolves.toEqual(
        []
      );
    }
  });

  it("creates no intention when the lead has no phone", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 sem telefone ${randomUUID()}`);
    const opportunity_id = await ingestLead(tenant, {
      email: "sem@exemplo.com",
      name: "Sem telefone"
    });
    const [card] = (await inspectCards(tenant.workspace_id)).filter(
      (candidate) => candidate.id === opportunity_id
    );
    expect(card?.missing_phone).toBe(true);
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    await expect(inspectOutboundAttempts(tenant.workspace_id, opportunity_id)).resolves.toEqual([]);
  });

  it("does not claim a merged card, so no attempt is born", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 mesclado ${randomUUID()}`);
    const survivor_id = await ingestLead(tenant, {
      phone: "11970003333",
      name: "Canonica",
      received_at: new Date("2026-08-20T12:00:00.000Z")
    });
    const absorbed_id = await ingestLead(tenant, {
      phone: "11970003333",
      name: "Mesclada",
      received_at: new Date("2026-08-20T12:01:00.000Z")
    });
    const reviews = await inspectPendingDuplicateReviews(tenant.workspace_id);
    const review = reviews.find(
      (item) => item.opportunity_id === absorbed_id || item.related_opportunity_id === absorbed_id
    );
    if (!review) {
      throw new Error("expected a possible-duplicate review for the second card");
    }
    await resolveIntakeReview(tenant.manager, {
      review_id: review.id,
      resolution: "SAME_FINANCING",
      reason: "mesmo contrato",
      resolved_at: new Date("2026-08-20T13:00:00.000Z")
    });
    const merged = await inspectCards(tenant.workspace_id);
    expect(merged.find((card) => card.id === absorbed_id)?.merged_into_opportunity_id).toBe(
      survivor_id
    );
    const result = await assignToSupervisor(tenant, absorbed_id);
    expect(result.assigned).toEqual([]);
    expect(result.refused[0]?.reason).toBe("NOT_VISIBLE");
    await expect(inspectOutboundAttempts(tenant.workspace_id, absorbed_id)).resolves.toEqual([]);
  });

  it("records a terminal FAILED attempt when the instance is disconnected", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 desconectada ${randomUUID()}`, {
      connect_whatsapp: false
    });
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    const attempts = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    expect(attempts).toEqual([
      expect.objectContaining({
        delivery_status: "FAILED",
        failure_reason: "INSTANCE_NOT_CONNECTED",
        dispatch_status: "DISPATCHED"
      })
    ]);
    expect(await inspectMessageFacts(tenant.workspace_id, opportunity_id)).toEqual([
      expect.objectContaining({ type: "WHATSAPP_OUTBOUND_FAILED", opportunity_id })
    ]);
    expect((await inspectCards(tenant.workspace_id))[0]?.first_contact_at).toBeNull();
  });

  it("refuses an invalid template at write, and fails closed without sendText if one is stored", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 template ${randomUUID()}`);
    await expect(
      updateWorkspaceSettings(tenant.manager, {
        first_contact_trigger: "ON_ASSIGNMENT",
        first_contact_template_body: "Olá {{unknown_field}}"
      })
    ).rejects.toBeInstanceOf(WorkspaceSettingsWriteError);

    await seedRejectedFirstContactTemplate(tenant.workspace_id, "Olá {{unknown_field}}");
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE, name: "Maria Souza" });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    const [pending] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    if (!pending) {
      throw new Error("expected a queued attempt; template is checked at send time");
    }

    const sendText = vi.fn<SendText>();
    await dispatchPendingChannelAttempts(publisher, 100);
    await promoteAttempt(pending.id);
    const worker = await runChannelWorker(sendText, [tenant.workspace_id], async () => {
      const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
      expect(attempt?.delivery_status).toBe("FAILED");
    });
    await worker.close();

    expect(sendText).not.toHaveBeenCalled();
    expect((await inspectCards(tenant.workspace_id))[0]?.first_contact_at).toBeNull();
    expect(await inspectMessageFacts(tenant.workspace_id, opportunity_id)).toEqual([
      expect.objectContaining({ type: "WHATSAPP_OUTBOUND_FAILED", opportunity_id })
    ]);
  });

  it("does not fill first_contact_at when sendText returns a non-2xx", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 http ${randomUUID()}`);
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE, name: "Maria Souza" });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    const [pending] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    if (!pending) {
      throw new Error("expected a pending attempt");
    }

    const sendText = vi.fn<SendText>().mockResolvedValue({ kind: "http_error", status: 500 });
    await dispatchPendingChannelAttempts(publisher, 100);
    await promoteAttempt(pending.id);
    const worker = await runChannelWorker(sendText, [tenant.workspace_id], async () => {
      const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
      expect(attempt?.delivery_status).toBe("FAILED");
    });
    await worker.close();

    expect(sendText).toHaveBeenCalledOnce();
    const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    expect(attempt?.failure_reason).toBe("UNCERTAIN_EXTERNAL");
    expect((await inspectCards(tenant.workspace_id))[0]?.first_contact_at).toBeNull();
    expect(await inspectMessageFacts(tenant.workspace_id, opportunity_id)).toEqual([
      expect.objectContaining({ type: "WHATSAPP_OUTBOUND_FAILED", opportunity_id })
    ]);
  });
});

describe("Seam 4: mass assignment and per-workspace rate limit", () => {
  it("creates one attempt per eligible card and holds extras after 6 sends in the window", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 massa ${randomUUID()}`);
    const neighbour = await seedReadyWorkspace(`Seam 4 vizinho ${randomUUID()}`);
    const opportunity_ids: string[] = [];
    for (let index = 0; index < 7; index += 1) {
      opportunity_ids.push(
        await ingestLead(tenant, {
          phone: `1197001${String(index).padStart(4, "0")}`,
          name: `Lead ${index}`
        })
      );
    }
    const neighbour_id = await ingestLead(neighbour, { phone: "11970019999", name: "Vizinho" });

    const mass = await assignLeads(tenant.manager, {
      opportunity_ids,
      user_id: tenant.supervisor.user_id
    });
    expect(mass.assigned).toHaveLength(7);
    const delivered = await reassignLeads(tenant.supervisor, {
      assignments: opportunity_ids.map((opportunity_id) => ({
        opportunity_id,
        current_user_id: tenant.supervisor.user_id
      })),
      user_id: tenant.attendant.user_id
    });
    expect(delivered.assigned).toHaveLength(7);
    expect(await inspectOutboundAttempts(tenant.workspace_id)).toHaveLength(7);

    await assignToSupervisor(neighbour, neighbour_id);
    await reassignToAttendant(neighbour, neighbour_id);

    const sendText = vi.fn<SendText>().mockResolvedValue({ kind: "accepted" });
    const rateLimiter = createMemoryRateLimiter({
      limit: CHANNEL_OUTBOUND_RATE_LIMIT_MAX,
      window_ms: CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS
    });
    await dispatchPendingChannelAttempts(publisher, 100);
    const pending = [
      ...(await inspectOutboundAttempts(tenant.workspace_id)),
      ...(await inspectOutboundAttempts(neighbour.workspace_id))
    ];
    for (const attempt of pending) {
      await promoteAttempt(attempt.id);
    }

    const worker = await runChannelWorker(
      sendText,
      [tenant.workspace_id, neighbour.workspace_id],
      async () => {
        const tenant_attempts = await inspectOutboundAttempts(tenant.workspace_id);
        const neighbour_attempts = await inspectOutboundAttempts(neighbour.workspace_id);
        expect(tenant_attempts.filter((attempt) => attempt.delivery_status === "SENT")).toHaveLength(
          CHANNEL_OUTBOUND_RATE_LIMIT_MAX
        );
        expect(neighbour_attempts[0]?.delivery_status).toBe("SENT");
      },
      rateLimiter
    );
    await worker.close();

    const tenant_attempts = await inspectOutboundAttempts(tenant.workspace_id);
    expect(tenant_attempts.filter((attempt) => attempt.delivery_status === "SENT")).toHaveLength(6);
    expect(tenant_attempts.filter((attempt) => attempt.delivery_status === "QUEUED")).toHaveLength(1);
    expect(sendText).toHaveBeenCalledTimes(7);
    const neighbour_card = (await inspectCards(neighbour.workspace_id))[0];
    expect(neighbour_card?.first_contact_at).toBeInstanceOf(Date);
  });
});

describe("Seam 4: Activity and WhatsApp compete for first_contact_at write-once", () => {
  it("keeps the first stamp when both complete in the same window", async () => {
    const tenant = await seedReadyWorkspace(`Seam 4 corrida ${randomUUID()}`);
    const opportunity_id = await ingestLead(tenant, { phone: LEAD_PHONE, name: "Maria Souza" });
    await assignToSupervisor(tenant, opportunity_id);
    await reassignToAttendant(tenant, opportunity_id);
    const activity = await createActivity(tenant.attendant, {
      opportunity_id,
      type: "CALL",
      title: "Primeiro contato",
      due_at: new Date("2026-08-21T12:00:00.000Z")
    });
    const [pending] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
    if (!pending) {
      throw new Error("expected a pending attempt");
    }

    const sendText = vi.fn<SendText>().mockResolvedValue({ kind: "accepted" });
    await dispatchPendingChannelAttempts(publisher, 100);
    await promoteAttempt(pending.id);

    const worker = startChannelWorker(sendText, [tenant.workspace_id]);
    try {
      const [, completed] = await Promise.all([
        vi.waitFor(
          async () => {
            const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
            expect(attempt?.delivery_status).toBe("SENT");
          },
          { timeout: 30_000, interval: 250 }
        ),
        completeActivity(tenant.attendant, activity.id)
      ]);

      const [card] = await inspectCards(tenant.workspace_id);
      const [attempt] = await inspectOutboundAttempts(tenant.workspace_id, opportunity_id);
      expect(card?.first_contact_at).toBeInstanceOf(Date);
      expect([attempt?.sent_at?.getTime(), completed.completed_at?.getTime()]).toContain(
        card?.first_contact_at?.getTime()
      );

      const after = await inspectCards(tenant.workspace_id);
      expect(after[0]?.first_contact_at).toEqual(card?.first_contact_at);
      expect(sendText).toHaveBeenCalledOnce();
    } finally {
      await worker.close();
    }
  });
});
