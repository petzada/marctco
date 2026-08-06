import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createJobContext, type JobContext, type UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { hashIntegrationToken } from "./integration-connection.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_CLAIM_BATCH = 500;
const sharedPrisma = createPrismaClient();

export interface RecordIntegrationEventInput {
  /** Resolved from the bearer token, never from the request body (ADR-0007). */
  readonly workspace_id: string;
  readonly token: string;
  /** Whatever the sender posted, as long as it parsed as JSON. */
  readonly raw: unknown;
}

export interface RecordedIntegrationEvent {
  readonly integration_event_id: string;
}

export interface PendingIntegrationEvent {
  readonly id: string;
  readonly workspace_id: string;
}

export interface IntegrationEventForProcessing {
  readonly id: string;
  readonly integration_connection_id: string;
  readonly status: "RECEIVED" | "PROCESSED" | "QUARANTINED" | "FAILED";
  readonly raw: unknown;
  readonly received_at: Date;
}

interface IdRow {
  readonly id: string;
}

function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID, received: ${JSON.stringify(value)}`);
  }
}

/**
 * Accepts a lead by committing it. The handler's whole contract is this: the
 * payload is durable before the 200, nothing interprets it yet, and no Redis
 * is involved — an unavailable queue must not be able to turn a lead into a
 * lost lead (ADR-0007).
 *
 * The connection is re-read inside the tenant-scoped transaction rather than
 * trusted from the pre-tenant token resolver, which returns `workspace_id` and
 * nothing else (ADR-0019): a connection disabled between the two reads must
 * not still be able to write an event.
 */
export async function recordIntegrationEvent(
  input: RecordIntegrationEventInput,
  prisma: PrismaClient = sharedPrisma
): Promise<RecordedIntegrationEvent> {
  assertUuid(input.workspace_id, "workspace_id");
  if (typeof input.token !== "string" || input.token === "") {
    throw new Error("An integration token is required to record an event");
  }
  if (input.raw === undefined) {
    throw new Error("An integration event must carry the payload it received");
  }

  // The event id is minted here so the transaction that writes it already has
  // the JobContext the worker will later carry for the same event.
  const integration_event_id = randomUUID();
  const context = createJobContext({
    workspace_id: input.workspace_id,
    integration_event_id
  });
  const token_hash = hashIntegrationToken(input.token);

  await withAccessContext(prisma, context, async (transaction) => {
    const connections = await transaction.$queryRaw<IdRow[]>`
      SELECT id
      FROM integration_connections
      WHERE token_hash = ${token_hash}
        AND status = 'ACTIVE'
    `;
    const connection = connections[0];
    if (!connection) {
      throw new Error("The integration connection is not active in this workspace");
    }

    await transaction.$executeRaw`
      INSERT INTO integration_events (
        id, workspace_id, integration_connection_id, raw, updated_at
      )
      VALUES (
        ${integration_event_id}::uuid,
        ${input.workspace_id}::uuid,
        ${connection.id}::uuid,
        ${JSON.stringify(input.raw)}::jsonb,
        CURRENT_TIMESTAMP
      )
    `;
  });

  return { integration_event_id };
}

/**
 * The dispatcher's source of work. It runs with no session and no tenant: a
 * claim per event would be circular, because setting the claim needs the
 * `workspace_id` that only the read reveals (ADR-0006 regra 9). The private
 * function answers with `(id, workspace_id)` and never the payload.
 */
export async function claimPendingIntegrationEvents(
  batch_size: number,
  prisma: PrismaClient = sharedPrisma
): Promise<PendingIntegrationEvent[]> {
  if (!Number.isInteger(batch_size) || batch_size < 1 || batch_size > MAX_CLAIM_BATCH) {
    throw new Error(`batch_size must be an integer between 1 and ${MAX_CLAIM_BATCH}`);
  }

  return prisma.$queryRaw<PendingIntegrationEvent[]>`
    SELECT id, workspace_id
    FROM private.claim_pending_events(${batch_size}::integer)
  `;
}

/**
 * Written only after BullMQ has confirmed the job. Marking first would let a
 * failed publish look like delivered work, which is the one way the outbox can
 * lose a lead (ADR-0007).
 */
export async function markIntegrationEventDispatched(
  context: JobContext,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  await withAccessContext(prisma, context, async (transaction) => {
    await transaction.$executeRaw`
      UPDATE integration_events
      SET dispatch_status = 'DISPATCHED',
          dispatched_at = COALESCE(dispatched_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${context.integration_event_id}::uuid
    `;
  });
}

/**
 * The worker's read, under RLS, scoped by the `workspace_id` the authenticated
 * handler put on the job. A job pointing at another workspace's event reads
 * zero rows, and this throws rather than treating "not mine" as "not there".
 */
export async function readIntegrationEventForProcessing(
  context: JobContext,
  prisma: PrismaClient = sharedPrisma
): Promise<IntegrationEventForProcessing> {
  const events = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<IntegrationEventForProcessing[]>`
      SELECT id, integration_connection_id, status::text AS status, raw, received_at
      FROM integration_events
      WHERE id = ${context.integration_event_id}::uuid
    `
  );
  const event = events[0];
  if (!event) {
    throw new Error(
      "The integration event is not visible in the workspace its job claims"
    );
  }
  return event;
}

export interface IntegrationEventRecord extends IntegrationEventForProcessing {
  readonly dispatch_status: "PENDING" | "DISPATCHED";
  readonly dispatched_at: Date | null;
  readonly processed_at: Date | null;
}

export interface ListIntegrationEventsOptions {
  readonly limit?: number;
}

/**
 * What the Integrações screen reads: what arrived, what was dispatched, what
 * was processed — the single source for that screen, with no parallel state in
 * Redis (ADR-0007). Scoped by the caller's workspace like every other named
 * read, and restricted to the profiles that own the account's plumbing.
 */
export async function listIntegrationEvents(
  context: UserContext,
  options: ListIntegrationEventsOptions = {},
  prisma: PrismaClient = sharedPrisma
): Promise<IntegrationEventRecord[]> {
  if (context.role !== "OWNER" && context.role !== "MANAGER") {
    throw new Error("Only MANAGER or OWNER can read integration events");
  }
  const limit = options.limit ?? 100;
  if (!Number.isInteger(limit) || limit < 1 || limit > 500) {
    throw new Error("limit must be an integer between 1 and 500");
  }

  return withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<IntegrationEventRecord[]>`
      SELECT
        id,
        integration_connection_id,
        status::text AS status,
        dispatch_status::text AS dispatch_status,
        raw,
        received_at,
        dispatched_at,
        processed_at
      FROM integration_events
      ORDER BY received_at DESC, id DESC
      LIMIT ${limit}::integer
    `
  );
}

/** Closes the loop for an event the worker finished with. */
export async function markIntegrationEventProcessed(
  context: JobContext,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  await withAccessContext(prisma, context, async (transaction) => {
    const updated = await transaction.$executeRaw`
      UPDATE integration_events
      SET status = 'PROCESSED',
          processed_at = COALESCE(processed_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${context.integration_event_id}::uuid
    `;
    if (updated === 0) {
      throw new Error(
        "The integration event is not visible in the workspace its job claims"
      );
    }
  });
}
