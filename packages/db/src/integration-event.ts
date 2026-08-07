import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import type {
  IntegrationEventDispatchStatus,
  IntegrationEventStatus,
  PrismaClient
} from "@prisma/client";
import { createJobContext, type JobContext, type UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { hashIntegrationToken, type IntegrationProvider } from "./integration-connection.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const MAX_CLAIM_BATCH = 500;
const MAX_EVENTS_PER_PAGE = 500;
const EVENT_NOT_VISIBLE = "The integration event is not visible in the workspace its job claims";
const sharedPrisma = createPrismaClient();

/** Re-exported from the generated enums so this module cannot drift from the schema. */
export type { IntegrationEventDispatchStatus, IntegrationEventStatus };

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

interface IntegrationEventFacts {
  readonly id: string;
  readonly integration_connection_id: string;
  readonly status: IntegrationEventStatus;
  readonly raw: unknown;
  readonly received_at: Date;
}

export interface IntegrationEventForProcessing extends IntegrationEventFacts {
  /**
   * Which connection the event came through, read in the same transaction.
   * The connector needs it to decide the origin of a payload that did not
   * declare one, and it is not on the event itself (ADR-0008).
   */
  readonly provider: IntegrationProvider;
}

export interface IntegrationEventRecord extends IntegrationEventFacts {
  readonly dispatch_status: IntegrationEventDispatchStatus;
  readonly dispatched_at: Date | null;
  readonly processed_at: Date | null;
}

/** The keyset a caller carries to ask for the page after this row (ADR-0013). */
export interface IntegrationEventCursor {
  readonly received_at: Date;
  readonly id: string;
}

export interface ListIntegrationEventsOptions {
  readonly limit?: number;
  readonly after?: IntegrationEventCursor;
}

interface IdRow {
  readonly id: string;
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
 * lose a lead (ADR-0007). A write that touches no row means the event is not
 * in the workspace the caller claims, and that fails rather than reporting a
 * dispatch that never happened — otherwise the event stays pending forever and
 * is republished on every pass.
 */
export async function markIntegrationEventDispatched(
  context: JobContext,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  await withAccessContext(prisma, context, async (transaction) => {
    const updated = await transaction.$executeRaw`
      UPDATE integration_events
      SET dispatch_status = 'DISPATCHED',
          dispatched_at = COALESCE(dispatched_at, CURRENT_TIMESTAMP),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${context.integration_event_id}::uuid
    `;
    if (updated === 0) {
      throw new Error(EVENT_NOT_VISIBLE);
    }
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
      SELECT
        event.id,
        event.integration_connection_id,
        event.status::text AS status,
        event.raw,
        event.received_at,
        connection.provider::text AS provider
      FROM integration_events AS event
      JOIN integration_connections AS connection
        ON connection.workspace_id = event.workspace_id
       AND connection.id = event.integration_connection_id
      WHERE event.id = ${context.integration_event_id}::uuid
    `
  );
  const event = events[0];
  if (!event) {
    throw new Error(EVENT_NOT_VISIBLE);
  }
  return event;
}

/**
 * One workspace's events, newest first: what arrived, what was dispatched,
 * what was processed — the single source for the Integrações screen, with no
 * parallel state in Redis (ADR-0007).
 *
 * Paginated by keyset, never `OFFSET` (ADR-0013): events keep arriving while
 * someone reads, and an offset would skip or repeat rows precisely when the
 * screen is busiest. `(received_at, id)` is the same pair the index orders by,
 * so the tie between two events received in the same millisecond is broken the
 * same way on every page.
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
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EVENTS_PER_PAGE) {
    throw new Error(`limit must be an integer between 1 and ${MAX_EVENTS_PER_PAGE}`);
  }
  if (options.after) {
    assertUuid(options.after.id, "after.id");
    if (Number.isNaN(options.after.received_at.getTime())) {
      throw new Error("after.received_at must be a valid instant");
    }
  }

  const after = options.after;
  const keyset = after
    ? Prisma.sql`WHERE (received_at, id) < (${after.received_at}::timestamptz, ${after.id}::uuid)`
    : Prisma.empty;

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
      ${keyset}
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
      throw new Error(EVENT_NOT_VISIBLE);
    }
  });
}
