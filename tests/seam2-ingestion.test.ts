import { randomUUID } from "node:crypto";
import {
  createIntegrationConnection,
  createJobContext,
  listDeadLetterEvents,
  listIntegrationEvents,
  markIntegrationEventFailed,
  provisionWorkspace,
  requeueIntegrationEventForReprocessing,
  resolveUserContextForSlug,
  type UserContext
} from "@marctco/db";
import { INTEGRATION_EVENT_QUEUE, integrationEventJobId } from "@marctco/domain";
import { Worker, type Job } from "bullmq";
import IORedis from "ioredis";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { POST } from "../apps/web/app/v1/integrations/pluga/leads/route";
import { dispatchPendingIntegrationEvents } from "../apps/web/lib/ingestion-dispatcher";
import { createIngestionQueue } from "../apps/web/lib/ingestion-queue";
import { processIntegrationEventJob } from "../apps/worker/src/integration-event-job";
// Named readers, so the raw Prisma client stays inside packages/db where the
// boundary of ADR-0016 puts it. They read what the path under test wrote; they
// never make anything happen.
import {
  closeSeamInspection,
  inspectCards,
  inspectDefaultEntryStage,
  inspectSubmissions,
  inspectTimeline
} from "../packages/db/tests/seam-inspection";

// Everything here runs through the same named operations the application uses,
// against a real Postgres and a real Redis. The application's connection is the
// app role, so RLS applies exactly as in production.
const redis_url = process.env.REDIS_URL;
if (!redis_url) {
  throw new Error("Seam 2 needs a real REDIS_URL");
}

const queue = createIngestionQueue(redis_url);
const redis = new IORedis(redis_url, { maxRetriesPerRequest: null });
const owner_user_id = randomUUID();
const foreign_owner_user_id = randomUUID();

interface SeededWorkspace {
  readonly workspace_id: string;
  readonly context: UserContext;
  readonly token: string;
}

async function seedWorkspace(user_id: string, name: string): Promise<SeededWorkspace> {
  const provisioned = await provisionWorkspace({ owner_user_id: user_id, workspace_name: name });
  const resolved = await resolveUserContextForSlug(user_id, provisioned.slug);
  if (!resolved) {
    throw new Error("the provisioned workspace did not resolve for its owner");
  }
  const connection = await createIntegrationConnection(resolved.context, { provider: "PLUGA" });
  return {
    workspace_id: provisioned.workspace_id,
    context: resolved.context,
    token: connection.token
  };
}

function leadRequest(bearer: string, body: string): Request {
  return new Request("https://app.marctco.test/v1/integrations/pluga/leads", {
    method: "POST",
    headers: { authorization: `Bearer ${bearer}`, "content-type": "application/json" },
    body
  });
}

function jobKey(integration_event_id: string): string {
  return `bull:${INTEGRATION_EVENT_QUEUE}:${integrationEventJobId(integration_event_id)}`;
}

let tenant: SeededWorkspace;
let neighbour: SeededWorkspace;

beforeAll(async () => {
  tenant = await seedWorkspace(owner_user_id, `Seam 2 ${randomUUID()}`);
  neighbour = await seedWorkspace(foreign_owner_user_id, `Seam 2 vizinho ${randomUUID()}`);
});

afterAll(async () => {
  const events = await listIntegrationEvents(tenant.context, { limit: 500 });
  for (const event of events) {
    await redis.del(jobKey(event.id));
  }
  await queue.close();
  await redis.quit();
  await closeSeamInspection();
});

describe("Seam 2: a POST becomes a durable event, a job, and a processed event", () => {
  it("commits the payload before the 200, and leaves it pending for the dispatcher", async () => {
    const response = await POST(
      leadRequest(tenant.token, JSON.stringify({ nome: "Fulano", telefone: "11999998888" }))
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });

    // The row exists the instant the caller was told "accepted": Redis was
    // never part of that answer.
    const events = await listIntegrationEvents(tenant.context);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      status: "RECEIVED",
      dispatch_status: "PENDING",
      dispatched_at: null,
      processed_at: null,
      raw: { nome: "Fulano", telefone: "11999998888" }
    });
  });

  it("ignores a workspace_id in the body and keeps the tenant the token resolved", async () => {
    const response = await POST(
      leadRequest(
        tenant.token,
        JSON.stringify({ workspace_id: neighbour.workspace_id, nome: "Beltrano" })
      )
    );

    expect(response.status).toBe(200);
    await expect(listIntegrationEvents(neighbour.context)).resolves.toEqual([]);
    await expect(listIntegrationEvents(tenant.context)).resolves.toHaveLength(2);
  });

  it("answers 200 to a retransmission too, and never 409", async () => {
    // Idempotency has exactly one owner, and it is not the request path: a
    // duplicate is accepted and recorded, and what it means to the funnel is
    // decided later by the worker (ADR-0007).
    const body = JSON.stringify({ nome: "Fulano", telefone: "11999998888" });
    const first = await POST(leadRequest(tenant.token, body));
    const second = await POST(leadRequest(tenant.token, body));

    expect([first.status, second.status]).toEqual([200, 200]);
    await expect(first.json()).resolves.toEqual({ status: "accepted" });
    await expect(second.json()).resolves.toEqual({ status: "accepted" });
    await expect(listIntegrationEvents(tenant.context)).resolves.toHaveLength(4);
  });

  it("pages by keyset, so a lead arriving mid-read neither repeats nor hides a row", async () => {
    const all = await listIntegrationEvents(tenant.context);
    expect(all.length).toBeGreaterThanOrEqual(4);

    const first_page = await listIntegrationEvents(tenant.context, { limit: 2 });
    const cursor = first_page[1];
    if (!cursor) {
      throw new Error("expected a second row to page from");
    }

    // A new event lands between the two reads, exactly as it would in
    // production. An OFFSET would shift the window and repeat a row here.
    await POST(leadRequest(tenant.token, JSON.stringify({ nome: "Chegou no meio" })));

    const second_page = await listIntegrationEvents(tenant.context, {
      limit: 2,
      after: { received_at: cursor.received_at, id: cursor.id }
    });

    const seen = [...first_page, ...second_page].map((event) => event.id);
    expect(new Set(seen).size).toBe(seen.length);
    expect(second_page.map((event) => event.id)).toEqual(
      all.slice(2, 4).map((event) => event.id)
    );
  });

  it("publishes every pending event once, under a job id derived from the event", async () => {
    const pending = (await listIntegrationEvents(tenant.context)).filter(
      (event) => event.dispatch_status === "PENDING"
    );
    expect(pending).toHaveLength(5);

    // The dispatcher looks for pending work in every workspace at once, so what
    // is asserted here is that it published everything it claimed, and that
    // this tenant's events are the ones that came out dispatched.
    const outcome = await dispatchPendingIntegrationEvents(queue.publisher, 100);
    expect(outcome.dispatched).toBe(outcome.claimed);
    expect(outcome.claimed).toBeGreaterThanOrEqual(pending.length);

    for (const event of pending) {
      await expect(redis.exists(jobKey(event.id))).resolves.toBe(1);
    }
    const dispatched = await listIntegrationEvents(tenant.context);
    expect(dispatched.every((event) => event.dispatch_status === "DISPATCHED")).toBe(true);
    expect(dispatched.every((event) => event.dispatched_at !== null)).toBe(true);

    // A second pass has nothing left to claim for this tenant: PostgreSQL, not
    // Redis, records what still needs publishing.
    await dispatchPendingIntegrationEvents(queue.publisher, 100);
    const settled = await listIntegrationEvents(tenant.context);
    expect(settled.filter((event) => event.dispatch_status === "PENDING")).toEqual([]);
  });

  it("puts identifiers in the job and never the payload", async () => {
    const [event] = await listIntegrationEvents(tenant.context);
    if (!event) {
      throw new Error("expected an event to inspect");
    }
    const job_data = await redis.hget(jobKey(event.id), "data");

    expect(JSON.parse(job_data ?? "{}")).toEqual({
      integration_event_id: event.id,
      workspace_id: tenant.workspace_id
    });
  });

  it("processes the queued jobs through a real BullMQ worker, under RLS", async () => {
    const queued = await listIntegrationEvents(tenant.context);
    expect(queued.every((event) => event.status === "RECEIVED")).toBe(true);

    const worker = new Worker(
      INTEGRATION_EVENT_QUEUE,
      async (job: Job) => processIntegrationEventJob(job.data),
      { connection: new IORedis(redis_url, { maxRetriesPerRequest: null }) }
    );

    try {
      await vi.waitFor(
        async () => {
          const events = await listIntegrationEvents(tenant.context);
          expect(events.filter((event) => event.status !== "RECEIVED")).toHaveLength(
            queued.length
          );
        },
        { timeout: 30_000, interval: 250 }
      );
    } finally {
      await worker.close();
    }

    // Every payload above was mapped to `nome`/`telefone`, which the `v1`
    // contract does not read — the exact shape of a mis-mapped automation. No
    // phone and no e-mail is the one submission that produces no card, so all
    // of them land in quarantine, visibly, instead of disappearing.
    const processed = await listIntegrationEvents(tenant.context);
    expect(processed.every((event) => event.status === "QUARANTINED")).toBe(true);
    // `processed_at` belongs to PROCESSED alone: an event waiting for a human
    // to complete it has not been processed.
    expect(processed.every((event) => event.processed_at === null)).toBe(true);
  });

  it("fails loudly when a job claims an event from another workspace", async () => {
    const [event] = await listIntegrationEvents(tenant.context);
    if (!event) {
      throw new Error("expected an event to inspect");
    }

    await expect(
      processIntegrationEventJob({
        integration_event_id: event.id,
        workspace_id: neighbour.workspace_id
      })
    ).rejects.toThrow(/not visible/i);
  });

  it("keeps answering 200 while the queue is unreachable, and publishes later", async () => {
    const unreachable = { publish: () => Promise.reject(new Error("ECONNREFUSED")) };

    const response = await POST(leadRequest(tenant.token, JSON.stringify({ nome: "Sicrano" })));
    expect(response.status).toBe(200);

    const failed_pass = await dispatchPendingIntegrationEvents(unreachable, 100);
    expect(failed_pass.dispatched).toBe(0);
    const still_pending = (await listIntegrationEvents(tenant.context)).filter(
      (event) => event.dispatch_status === "PENDING"
    );
    expect(still_pending).toHaveLength(1);

    // Redis comes back and the same event is published, under the same job id.
    await dispatchPendingIntegrationEvents(queue.publisher, 100);
    const recovered = await listIntegrationEvents(tenant.context);
    expect(recovered.filter((event) => event.dispatch_status === "PENDING")).toEqual([]);
    await expect(
      redis.exists(jobKey(still_pending[0]?.id ?? "missing"))
    ).resolves.toBe(1);
  });

  it("answers 401 for an unknown token and writes nothing", async () => {
    const before = await listIntegrationEvents(tenant.context);
    const response = await POST(leadRequest("mtco_unknown", JSON.stringify({ nome: "X" })));

    expect(response.status).toBe(401);
    await expect(listIntegrationEvents(tenant.context)).resolves.toHaveLength(before.length);
  });

  it("answers 400 for a body that is not JSON, and writes nothing", async () => {
    const before = await listIntegrationEvents(tenant.context);
    const response = await POST(leadRequest(tenant.token, "não é json"));

    expect(response.status).toBe(400);
    await expect(listIntegrationEvents(tenant.context)).resolves.toHaveLength(before.length);
  });
});


describe("Seam 2: the tracer bullet closes — a submission becomes a Pessoa and a card", () => {
  let carrier: SeededWorkspace;
  let entry: { pipeline_id: string; stage_id: string };

  /**
   * POST a lead, publish it, and let a real BullMQ worker process it. What the
   * tests below assert is the state that whole path left in PostgreSQL — the
   * authenticated handler, the outbox, the dispatcher, the queue and the worker
   * under RLS, with nothing stubbed between them.
   */
  async function deliver(body: Record<string, unknown>): Promise<void> {
    const response = await POST(leadRequest(carrier.token, JSON.stringify(body)));
    expect(response.status).toBe(200);
    await drainQueue();
  }

  async function drainQueue(): Promise<void> {
    await dispatchPendingIntegrationEvents(queue.publisher, 100);
    const worker = new Worker(
      INTEGRATION_EVENT_QUEUE,
      async (job: Job) => processIntegrationEventJob(job.data),
      { connection: new IORedis(redis_url, { maxRetriesPerRequest: null }) }
    );
    try {
      await vi.waitFor(
        async () => {
          const events = await listIntegrationEvents(carrier.context, { limit: 500 });
          expect(events.filter((event) => event.status === "RECEIVED")).toHaveLength(0);
        },
        { timeout: 30_000, interval: 250 }
      );
    } finally {
      await worker.close();
    }
  }

  beforeAll(async () => {
    carrier = await seedWorkspace(randomUUID(), `Seam 2 tracer ${randomUUID()}`);
    entry = await inspectDefaultEntryStage(carrier.workspace_id);
  });

  it("puts an unambiguous lead in the ENTRY stage of the default commercial pipeline", async () => {
    await deliver({
      external_lead_id: "tracer-1",
      name: "Maria Souza",
      phone: "(11) 98765-4321",
      email: "Maria@Exemplo.com",
      cpf: "529.982.247-25"
    });

    const [card] = await inspectCards(carrier.workspace_id);
    if (!card) {
      throw new Error("the unambiguous lead produced no card");
    }
    expect(card).toMatchObject({
      pipeline_id: entry.pipeline_id,
      stage_id: entry.stage_id,
      area: "COMMERCIAL",
      status: "OPEN",
      assigned_user_id: null,
      missing_phone: false,
      merged_into_opportunity_id: null
    });
    expect(card.reviews).toEqual([]);

    // Normalization survived the whole path, and the clock started at the
    // instant the lead actually arrived rather than whenever the queue drained.
    expect(card.person).toEqual({
      name: "Maria Souza",
      cpf: "52998224725",
      phones: ["+5511987654321"],
      emails: ["maria@exemplo.com"]
    });
    const [submission] = await inspectSubmissions(carrier.workspace_id, "tracer-1");
    expect(submission?.opportunity_id).toBe(card.id);
    expect(card.arrived_at).toEqual(submission?.received_at);
  });

  it("gives the same Pessoa a second card, born linked to the first with no financing data", async () => {
    // A genuinely new transmission from the same phone. Nothing is held: the
    // card exists and carries the warning, which is what stops two attendants
    // calling the same client (ADR-0007 §Mecanismo 2). No financing data
    // arrived, which is the common case and exactly where a similarity test
    // would have produced no link at all.
    await deliver({ external_lead_id: "tracer-2", name: "Maria Souza", phone: "11987654321" });

    const cards = await inspectCards(carrier.workspace_id);
    expect(cards).toHaveLength(2);
    const [first, second] = cards;
    if (!first || !second) {
      throw new Error("expected two cards");
    }
    expect(second.person_id).toBe(first.person_id);
    expect(second.reviews).toEqual([
      {
        type: "POSSIBLE_DUPLICATE",
        candidate_person_ids: [],
        related_opportunity_id: first.id
      }
    ]);
    // Both are attendable right now; neither waited on a human.
    expect([first.status, second.status]).toEqual(["OPEN", "OPEN"]);
  });

  it("creates a card with a marked identity conflict rather than holding the lead", async () => {
    // A phone that belongs to Maria and a CPF that belongs to somebody else:
    // the keys point at different Pessoas, so a new Pessoa is created, no link
    // to an existing record is made, and the candidates are recorded for a
    // human to merge later.
    await deliver({
      external_lead_id: "tracer-3",
      name: "Maria S.",
      phone: "11987654321",
      cpf: "111.444.777-35"
    });

    const cards = await inspectCards(carrier.workspace_id);
    expect(cards).toHaveLength(3);
    const conflicted = cards[2];
    const maria = cards[0];
    if (!conflicted || !maria) {
      throw new Error("expected a third card");
    }
    expect(conflicted.person_id).not.toBe(maria.person_id);
    expect(conflicted.status).toBe("OPEN");
    expect(conflicted.reviews).toEqual([
      {
        type: "IDENTITY_CONFLICT",
        candidate_person_ids: [maria.person_id],
        related_opportunity_id: null
      }
    ]);
  });

  it("marks a lead that brought an e-mail and no phone, and lets it into the funnel", async () => {
    await deliver({
      external_lead_id: "tracer-4",
      name: "Sem telefone",
      email: "sem@exemplo.com"
    });

    const cards = await inspectCards(carrier.workspace_id);
    expect(cards).toHaveLength(4);
    expect(cards[3]).toMatchObject({ missing_phone: true, status: "OPEN" });
  });

  it("quarantines a submission with no phone and no e-mail, and creates no card", async () => {
    await deliver({ external_lead_id: "tracer-5", name: "Sem contato", cpf: "529.982.247-25" });

    // A valid CPF does not rescue it: it identifies, but nobody is called on it.
    expect(await inspectCards(carrier.workspace_id)).toHaveLength(4);
    const [submission] = await inspectSubmissions(carrier.workspace_id, "tracer-5");
    expect(submission?.opportunity_id).toBeNull();
    const events = await listIntegrationEvents(carrier.context, { limit: 500 });
    expect(events.filter((event) => event.status === "QUARANTINED")).toHaveLength(1);
  });

  it("produces one card for two simultaneous transmissions of the same external id", async () => {
    const body = JSON.stringify({
      external_lead_id: "tracer-race",
      name: "Corrida",
      phone: "11955554444"
    });
    const [first, second] = await Promise.all([
      POST(leadRequest(carrier.token, body)),
      POST(leadRequest(carrier.token, body))
    ]);
    expect([first.status, second.status]).toEqual([200, 200]);
    await drainQueue();

    // Two events, two transmissions, one submission and one card. Nothing but
    // the constraint could have decided that.
    const submissions = await inspectSubmissions(carrier.workspace_id, "tracer-race");
    expect(submissions).toHaveLength(1);
    expect(submissions[0]?.transmission_count).toBe(2);

    const cards = await inspectCards(carrier.workspace_id);
    expect(cards).toHaveLength(5);
    expect(cards.filter((card) => card.id === submissions[0]?.opportunity_id)).toHaveLength(1);
  });

  it("leaves a retransmission inert: the resend moves the pointer and nothing else", async () => {
    const before = (await inspectCards(carrier.workspace_id)).find((card) =>
      card.person.phones.includes("+5511955554444")
    );
    if (!before) {
      throw new Error("expected the raced card");
    }
    const timeline_before = await inspectTimeline(carrier.workspace_id, before.id);

    await deliver({ external_lead_id: "tracer-race", name: "Corrida", phone: "11955554444" });

    const [submission] = await inspectSubmissions(carrier.workspace_id, "tracer-race");
    expect(submission?.transmission_count).toBe(3);
    const cards = await inspectCards(carrier.workspace_id);
    expect(cards.find((card) => card.id === before.id)).toEqual(before);
    expect(cards).toHaveLength(5);
    const timeline = await inspectTimeline(carrier.workspace_id, before.id);
    expect(timeline).toHaveLength(timeline_before.length + 1);
    expect(timeline.at(-1)).toMatchObject({
      type: "RETRANSMISSION_RECEIVED",
      opportunity_id: before.id,
      lead_submission_id: submission?.id,
      integration_event_id: submission?.last_integration_event_id
    });
  });

  it("keeps every card and submission inside the workspace that received it", async () => {
    // The other tenants in this file received only contact-less payloads, so a
    // card appearing there would mean a workspace boundary was crossed rather
    // than that a lead was processed.
    for (const other of [tenant, neighbour]) {
      await expect(inspectCards(other.workspace_id)).resolves.toEqual([]);
    }
    await expect(inspectCards(carrier.workspace_id)).resolves.toHaveLength(5);
    await expect(inspectSubmissions(neighbour.workspace_id)).resolves.toEqual([]);
  });
});

/**
 * Ticket 15. The two claims the outbox exists to make, proven end to end: a
 * lead accepted while Redis was down reaches the funnel as soon as Redis
 * returns, and the "reprocessar" button — the same mechanism, reached from the
 * screen instead of from the sweep — never produces a second Pessoa or a
 * second Oportunidade.
 */
describe("Seam 2: outbox recovery, reprocessing and the dead letter", () => {
  let recovered: SeededWorkspace;

  const unreachable = { publish: () => Promise.reject(new Error("ECONNREFUSED")) };

  /**
   * Publishes what is pending and lets a real BullMQ worker take it, waiting
   * for that job specifically. The drain used by the tracer block waits for
   * "no RECEIVED events left", which cannot see a reprocessing: an already
   * PROCESSED event never goes back to RECEIVED.
   */
  async function processThroughWorker(integration_event_id: string): Promise<void> {
    await dispatchPendingIntegrationEvents(queue.publisher, 100);
    const job_id = integrationEventJobId(integration_event_id);
    const worker = new Worker(
      INTEGRATION_EVENT_QUEUE,
      async (job: Job) => processIntegrationEventJob(job.data),
      { connection: new IORedis(redis_url, { maxRetriesPerRequest: null }) }
    );
    try {
      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error("the worker never took the job")), 30_000);
        worker.on("completed", (job: Job) => {
          if (job.id === job_id) {
            clearTimeout(timer);
            resolve();
          }
        });
        worker.on("failed", (job: Job | undefined, error: Error) => {
          if (job?.id === job_id) {
            clearTimeout(timer);
            reject(error);
          }
        });
      });
    } finally {
      await worker.close();
    }
  }

  async function onlyEvent(): Promise<string> {
    const [event] = await listIntegrationEvents(recovered.context, { limit: 5 });
    if (!event) {
      throw new Error("expected the workspace to have received an event");
    }
    return event.id;
  }

  beforeAll(async () => {
    recovered = await seedWorkspace(randomUUID(), `Seam 2 outbox ${randomUUID()}`);
  });

  it("processes a lead accepted while Redis was down, as soon as Redis comes back", async () => {
    const response = await POST(
      leadRequest(
        recovered.token,
        JSON.stringify({ external_lead_id: "outbox-1", name: "Joana Lima", phone: "11912345678" })
      )
    );
    expect(response.status).toBe(200);

    // The queue is unreachable: the pass moves nothing and the lead is still
    // only in PostgreSQL, which is where accepting it put it.
    await expect(dispatchPendingIntegrationEvents(unreachable, 100)).resolves.toMatchObject({
      dispatched: 0
    });
    await expect(inspectCards(recovered.workspace_id)).resolves.toEqual([]);

    await processThroughWorker(await onlyEvent());

    const cards = await inspectCards(recovered.workspace_id);
    expect(cards).toHaveLength(1);
    expect(cards[0]?.person).toMatchObject({ name: "Joana Lima", phones: ["+5511912345678"] });
  });

  it("reprocesses without creating a second Pessoa or a second Oportunidade", async () => {
    const event_id = await onlyEvent();
    const [before] = await inspectCards(recovered.workspace_id);

    await requeueIntegrationEventForReprocessing(recovered.context, event_id);
    await processThroughWorker(event_id);

    const after = await inspectCards(recovered.workspace_id);
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(before?.id);
    expect(after[0]?.person_id).toBe(before?.person_id);
    await expect(inspectSubmissions(recovered.workspace_id, "outbox-1")).resolves.toHaveLength(1);
  });

  it("lets an event leave the dead letter through that same mechanism", async () => {
    const response = await POST(
      leadRequest(
        recovered.token,
        JSON.stringify({ external_lead_id: "outbox-2", name: "Rita Alves", phone: "11955554444" })
      )
    );
    expect(response.status).toBe(200);
    const event_id = await onlyEvent();

    // The state the worker leaves behind once BullMQ has run out of attempts,
    // written by the same named operation `recordDeadLetter` calls.
    await markIntegrationEventFailed(
      createJobContext({ workspace_id: recovered.workspace_id, integration_event_id: event_id }),
      "Error: connector could not read the payload"
    );
    await expect(listDeadLetterEvents(recovered.context, { limit: 5 })).resolves.toMatchObject([
      { id: event_id, payload_present: true, failure_reason: "Error: connector could not read the payload" }
    ]);

    await requeueIntegrationEventForReprocessing(recovered.context, event_id);
    await processThroughWorker(event_id);

    await expect(listDeadLetterEvents(recovered.context, { limit: 5 })).resolves.toEqual([]);
    const cards = await inspectCards(recovered.workspace_id);
    expect(cards).toHaveLength(2);
    expect(cards.some((card) => card.person.name === "Rita Alves")).toBe(true);
  });
});
