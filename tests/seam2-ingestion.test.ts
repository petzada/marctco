import { randomUUID } from "node:crypto";
import {
  createIntegrationConnection,
  listIntegrationEvents,
  provisionWorkspace,
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
          expect(events.filter((event) => event.status === "PROCESSED")).toHaveLength(
            queued.length
          );
        },
        { timeout: 30_000, interval: 250 }
      );
    } finally {
      await worker.close();
    }

    const processed = await listIntegrationEvents(tenant.context);
    expect(processed.every((event) => event.processed_at !== null)).toBe(true);
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
