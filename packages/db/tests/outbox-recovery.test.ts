import { randomUUID } from "node:crypto";
import { Prisma, PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createJobContext,
  createUserContextFromResolvedMembership,
  type UserContext
} from "../src/access-context.js";
import {
  claimPendingIntegrationEvents,
  listDeadLetterEvents,
  listIntegrationEvents,
  markIntegrationEventFailed,
  requeueIntegrationEventForReprocessing
} from "../src/integration-event.js";
import {
  claimWorkspacesWithExpiringPayloads,
  expireIntegrationEventPayloads,
  payloadExpiryCutoff
} from "../src/payload-expiry.js";

/**
 * Ticket 15, against a real PostgreSQL: the dead letter, the reprocessing that
 * empties it through the *same* dispatcher, and the payload expiry of
 * ADR-0014 — including its one hard exception, the quarantined event that does
 * not expire while it is quarantine.
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
const connection_id = randomUUID();
const neighbour_connection_id = randomUUID();

const NOW = new Date("2026-08-11T12:00:00.000Z");
const LONG_AGO = new Date("2026-01-01T12:00:00.000Z");
const RECENT = new Date("2026-08-01T12:00:00.000Z");

const manager: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: randomUUID(),
  role: "MANAGER"
});
const attendant: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: randomUUID(),
  role: "ATTENDANT"
});
const neighbour_manager: UserContext = createUserContextFromResolvedMembership({
  workspace_id: neighbour_workspace,
  user_id: randomUUID(),
  role: "MANAGER"
});

interface SeedEventInput {
  readonly workspace_id?: string;
  readonly received_at?: Date;
  readonly status?: "RECEIVED" | "PROCESSED" | "QUARANTINED";
  readonly dispatch_status?: "PENDING" | "DISPATCHED";
  readonly raw?: unknown;
}

async function seedEvent(input: SeedEventInput = {}): Promise<string> {
  const workspace_id = input.workspace_id ?? workspace;
  const status = input.status ?? "RECEIVED";
  const dispatch_status = input.dispatch_status ?? "PENDING";
  const id = randomUUID();
  await seeder.integrationEvent.create({
    data: {
      id,
      workspace_id,
      integration_connection_id:
        workspace_id === workspace ? connection_id : neighbour_connection_id,
      raw: input.raw ?? { full_name: "Maria", phone: "+5511987654321" },
      status,
      dispatch_status,
      received_at: input.received_at ?? RECENT,
      dispatched_at: dispatch_status === "DISPATCHED" ? new Date() : null,
      processed_at: status === "PROCESSED" ? new Date() : null
    }
  });
  return id;
}

function jobFor(event_id: string, workspace_id: string = workspace) {
  return createJobContext({ workspace_id, integration_event_id: event_id });
}

async function readEvent(id: string) {
  return seeder.integrationEvent.findUniqueOrThrow({ where: { id } });
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Outbox" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Outbox vizinha" }
      ]
    });
    // A workspace is only valid with exactly one default commercial pipeline
    // (ticket 05); the invariant is deferred to COMMIT, so the fixture has to
    // satisfy it in the same transaction.
    for (const workspace_id of [workspace, neighbour_workspace]) {
      await transaction.pipeline.create({
        data: {
          workspace_id,
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
    }
    await transaction.integrationConnection.createMany({
      data: [
        {
          id: connection_id,
          workspace_id: workspace,
          provider: "PLUGA",
          token_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          token_last4: "aaaa"
        },
        {
          id: neighbour_connection_id,
          workspace_id: neighbour_workspace,
          provider: "PLUGA",
          token_hash: randomUUID().replaceAll("-", "").padEnd(64, "1"),
          token_last4: "bbbb"
        }
      ]
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("markIntegrationEventFailed", () => {
  it("records the reason and the instant, and only for an exhausted job", async () => {
    const event_id = await seedEvent();

    await expect(
      markIntegrationEventFailed(jobFor(event_id), "Error: connector could not read the payload", app)
    ).resolves.toBe(true);

    const event = await readEvent(event_id);
    expect(event.status).toBe("FAILED");
    expect(event.failure_reason).toBe("Error: connector could not read the payload");
    expect(event.failed_at).toBeInstanceOf(Date);
  });

  it("refuses to relabel an event that already reached the funnel", async () => {
    const event_id = await seedEvent({ status: "PROCESSED", dispatch_status: "DISPATCHED" });

    await expect(markIntegrationEventFailed(jobFor(event_id), "Error: late failure", app)).resolves.toBe(
      false
    );
    const event = await readEvent(event_id);
    expect(event.status).toBe("PROCESSED");
    expect(event.failure_reason).toBeNull();
  });

  it("leaves a quarantined event in quarantine — it is a pending action, not a defect", async () => {
    const event_id = await seedEvent({ status: "QUARANTINED" });

    await expect(markIntegrationEventFailed(jobFor(event_id), "Error: boom", app)).resolves.toBe(false);
    expect((await readEvent(event_id)).status).toBe("QUARANTINED");
  });

  it("fails loudly when the job claims another workspace's event", async () => {
    const event_id = await seedEvent();

    await expect(
      markIntegrationEventFailed(jobFor(event_id, neighbour_workspace), "Error: boom", app)
    ).rejects.toThrow(/not visible/);
    expect((await readEvent(event_id)).status).toBe("RECEIVED");
  });

  it("refuses to write a dead letter with no reason at all", async () => {
    const event_id = await seedEvent();
    await expect(markIntegrationEventFailed(jobFor(event_id), "   ", app)).rejects.toThrow(
      /why it failed/
    );
  });
});

describe("listDeadLetterEvents", () => {
  it("shows the failures newest first, with the reason and whether the payload survives", async () => {
    const older = await seedEvent();
    const newer = await seedEvent();
    await markIntegrationEventFailed(jobFor(older), "Error: primeira", app);
    await markIntegrationEventFailed(jobFor(newer), "Error: segunda", app);

    const dead_letter = await listDeadLetterEvents(manager, { limit: 50 }, app);
    const mine = dead_letter.filter((row) => row.id === older || row.id === newer);

    expect(mine.map((row) => row.id)).toEqual([newer, older]);
    expect(mine[0]).toMatchObject({ failure_reason: "Error: segunda", payload_present: true });
  });

  it("does not leak another workspace's dead letter", async () => {
    const mine = await seedEvent();
    await markIntegrationEventFailed(jobFor(mine), "Error: minha", app);

    const seen = await listDeadLetterEvents(neighbour_manager, { limit: 50 }, app);
    expect(seen.map((row) => row.id)).not.toContain(mine);
  });

  it("refuses ATTENDANT — the dead letter is Gestão's (ADR-0015)", async () => {
    await expect(listDeadLetterEvents(attendant, {}, app)).rejects.toThrow(/MANAGER or OWNER/);
  });
});

describe("requeueIntegrationEventForReprocessing", () => {
  it("empties the dead letter through the same dispatcher, with no parallel path", async () => {
    const event_id = await seedEvent({ dispatch_status: "DISPATCHED" });
    await markIntegrationEventFailed(jobFor(event_id), "Error: connector bug", app);

    await requeueIntegrationEventForReprocessing(manager, event_id, app);

    const event = await readEvent(event_id);
    expect(event.status).toBe("RECEIVED");
    expect(event.dispatch_status).toBe("PENDING");
    expect(event.failed_at).toBeNull();
    expect(event.failure_reason).toBeNull();

    // The very column `private.claim_pending_events` scans, proven by claiming.
    const claimed = await claimPendingIntegrationEvents(500, app);
    expect(claimed.map((row) => row.id)).toContain(event_id);

    const dead_letter = await listDeadLetterEvents(manager, { limit: 50 }, app);
    expect(dead_letter.map((row) => row.id)).not.toContain(event_id);
  });

  it("does not put an already processed event back in front of the worker", async () => {
    const event_id = await seedEvent({ status: "PROCESSED", dispatch_status: "DISPATCHED" });

    const claimed = await claimPendingIntegrationEvents(500, app);
    expect(claimed.map((row) => row.id)).not.toContain(event_id);
  });
});

describe("payload expiry", () => {
  it("clears the content after 90 days and keeps the fact", async () => {
    const event_id = await seedEvent({ received_at: LONG_AGO, dispatch_status: "DISPATCHED" });

    await expect(
      expireIntegrationEventPayloads(jobFor(event_id), { now: NOW, batch_size: 100 }, app)
    ).resolves.toBeGreaterThanOrEqual(1);

    const event = await readEvent(event_id);
    expect(event.raw).toBeNull();
    expect(event.received_at).toEqual(LONG_AGO);
    expect(event.status).toBe("RECEIVED");
    expect(event.dispatch_status).toBe("DISPATCHED");
  });

  it("does not touch a payload that is still inside the window", async () => {
    const recent = await seedEvent({ received_at: RECENT });
    const anchor = await seedEvent({ received_at: LONG_AGO });

    await expireIntegrationEventPayloads(jobFor(anchor), { now: NOW, batch_size: 100 }, app);

    expect((await readEvent(recent)).raw).not.toBeNull();
  });

  it("never expires an event while it is in quarantine (ADR-0014, exceção dura)", async () => {
    const quarantined = await seedEvent({ received_at: LONG_AGO, status: "QUARANTINED" });

    await expireIntegrationEventPayloads(jobFor(quarantined), { now: NOW, batch_size: 100 }, app);

    expect((await readEvent(quarantined)).raw).not.toBeNull();
  });

  it("works in batches, so no pass holds a long transaction", async () => {
    const first = await seedEvent({ received_at: LONG_AGO });
    const second = await seedEvent({ received_at: LONG_AGO });
    const third = await seedEvent({ received_at: LONG_AGO });

    const cleared = await expireIntegrationEventPayloads(
      jobFor(first),
      { now: NOW, batch_size: 2 },
      app
    );
    expect(cleared).toBe(2);

    const remaining = await seeder.integrationEvent.count({
      where: { id: { in: [first, second, third] }, raw: { not: Prisma.DbNull } }
    });
    expect(remaining).toBe(1);
  });

  it("refuses a batch size outside the bounds the sweep is allowed to ask for", async () => {
    const event_id = await seedEvent({ received_at: LONG_AGO });
    await expect(
      expireIntegrationEventPayloads(jobFor(event_id), { now: NOW, batch_size: 5_000 }, app)
    ).rejects.toThrow(/between 1 and 500/);
  });

  it("cannot expire another workspace's payload, even with a valid context", async () => {
    const neighbour_event = await seedEvent({
      workspace_id: neighbour_workspace,
      received_at: LONG_AGO
    });
    const mine = await seedEvent({ received_at: LONG_AGO });

    await expireIntegrationEventPayloads(jobFor(mine), { now: NOW, batch_size: 100 }, app);

    expect((await readEvent(neighbour_event)).raw).not.toBeNull();
  });

  it("discovers the tenants with expired payloads without a tenant, and only their ids", async () => {
    const event_id = await seedEvent({ received_at: LONG_AGO });

    const rows = await claimWorkspacesWithExpiringPayloads(NOW, app);
    const mine = rows.find((row) => row.workspace_id === workspace);

    expect(mine).toBeDefined();
    expect(Object.keys(mine ?? {}).sort()).toEqual([
      "anchor_integration_event_id",
      "workspace_id"
    ]);
    // The anchor is a real event of that tenant, so the sweep can open its
    // transaction with a JobContext instead of a context invented for it.
    const anchor = await readEvent(mine?.anchor_integration_event_id ?? event_id);
    expect(anchor.workspace_id).toBe(workspace);
  });

  it("puts the cutoff exactly 90 days before now", () => {
    expect(payloadExpiryCutoff(new Date("2026-08-11T00:00:00.000Z"))).toEqual(
      new Date("2026-05-13T00:00:00.000Z")
    );
  });
});

describe("listIntegrationEvents", () => {
  it("carries the failure so the history can show what broke", async () => {
    const event_id = await seedEvent();
    await markIntegrationEventFailed(jobFor(event_id), "Error: connector bug", app);

    const events = await listIntegrationEvents(manager, { limit: 100 }, app);
    const row = events.find((candidate) => candidate.id === event_id);

    expect(row).toMatchObject({ status: "FAILED", failure_reason: "Error: connector bug" });
    expect(row?.failed_at).toBeInstanceOf(Date);
  });
});
