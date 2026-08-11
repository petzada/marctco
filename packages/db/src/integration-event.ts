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
  /**
   * The funnel this connection overrides the workspace default with, or null
   * to use the default. It rides along on the same read because it belongs to
   * the same connection row, and a second round trip for one nullable column
   * would be paid on every lead (ADR-0009).
   */
  readonly target_pipeline_id: string | null;
}

export interface IntegrationEventRecord extends IntegrationEventFacts {
  readonly dispatch_status: IntegrationEventDispatchStatus;
  readonly dispatched_at: Date | null;
  readonly processed_at: Date | null;
  /** Both null unless `status` is `FAILED`, enforced by a CHECK (ticket 15). */
  readonly failed_at: Date | null;
  readonly failure_reason: string | null;
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

/**
 * One line of the dead letter. It carries the reason and whether the payload
 * is still there — not the payload itself: the screen decides between
 * "reprocessar" and "o conteúdo já expirou" from that boolean alone, and a
 * list has no business shipping a page of raw payloads to render a badge
 * (ADR-0014).
 */
export interface DeadLetterEventRecord {
  readonly id: string;
  readonly received_at: Date;
  readonly failed_at: Date;
  readonly failure_reason: string;
  readonly payload_present: boolean;
}

export interface DeadLetterEventCursor {
  readonly failed_at: Date;
  readonly id: string;
}

export interface ListDeadLetterEventsOptions {
  readonly limit?: number;
  readonly after?: DeadLetterEventCursor;
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

/** Longer than any reason `describeFailureReason` produces; the CHECK agrees. */
const MAX_FAILURE_REASON = 500;

/**
 * The dead letter, written once BullMQ has run out of attempts — never on the
 * first failure, because a failure that will be retried is not yet a failure a
 * human has to look at.
 *
 * It refuses to relabel an event that already settled. `PROCESSED` means the
 * plan committed and a later step threw: the lead is in the funnel, and
 * marking it failed would invent a problem for whoever reads the screen.
 * `QUARANTINED` is a pending human action, not a defect — writing `FAILED`
 * over it would drop the lead out of the quarantine queue *and* out of the
 * quarantine exception to the payload expiry (ADR-0014), which is the one way
 * a completable lead becomes unrecoverable.
 *
 * Returns whether it wrote. A job pointing at another workspace's event still
 * fails loudly (ADR-0006): "not mine" is not "already settled".
 */
export async function markIntegrationEventFailed(
  context: JobContext,
  failure_reason: string,
  prisma: PrismaClient = sharedPrisma
): Promise<boolean> {
  const reason = failure_reason.trim().slice(0, MAX_FAILURE_REASON);
  if (reason === "") {
    throw new Error("A dead-lettered event must record why it failed");
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const updated = await transaction.$executeRaw`
      UPDATE integration_events
      SET status = 'FAILED',
          failed_at = COALESCE(failed_at, CURRENT_TIMESTAMP),
          failure_reason = ${reason},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${context.integration_event_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
        AND status NOT IN ('PROCESSED', 'QUARANTINED')
    `;
    if (updated > 0) {
      return true;
    }

    const visible = await transaction.$queryRaw<IdRow[]>`
      SELECT id
      FROM integration_events
      WHERE id = ${context.integration_event_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
    `;
    if (visible.length === 0) {
      throw new Error(EVENT_NOT_VISIBLE);
    }
    return false;
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
        connection.provider::text AS provider,
        connection.target_pipeline_id
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
    ? Prisma.sql`AND (received_at, id) < (${after.received_at}::timestamptz, ${after.id}::uuid)`
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
        processed_at,
        failed_at,
        failure_reason
      FROM integration_events
      WHERE workspace_id = ${context.workspace_id}::uuid
      ${keyset}
      ORDER BY received_at DESC, id DESC
      LIMIT ${limit}::integer
    `
  );
}

/**
 * The dead letter: the events whose job exhausted every BullMQ attempt and
 * stopped being retried. It is a separate read rather than a filter over the
 * history because the two answer different questions — the history answers
 * "what arrived", newest first, and buries a failure from last week under a
 * hundred healthy leads; this one answers "what is broken and still waiting
 * for me", newest failure first, through the partial index that only the
 * failed rows are in.
 *
 * Keyset by `(failed_at, id)`, never `OFFSET` (ADR-0013). MANAGER and up: the
 * dead letter is operation, not credential (ADR-0015).
 */
export async function listDeadLetterEvents(
  context: UserContext,
  options: ListDeadLetterEventsOptions = {},
  prisma: PrismaClient = sharedPrisma
): Promise<DeadLetterEventRecord[]> {
  if (context.role !== "OWNER" && context.role !== "MANAGER") {
    throw new Error("Only MANAGER or OWNER can read the dead letter");
  }
  const limit = options.limit ?? 50;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_EVENTS_PER_PAGE) {
    throw new Error(`limit must be an integer between 1 and ${MAX_EVENTS_PER_PAGE}`);
  }
  if (options.after) {
    assertUuid(options.after.id, "after.id");
    if (Number.isNaN(options.after.failed_at.getTime())) {
      throw new Error("after.failed_at must be a valid instant");
    }
  }

  const after = options.after;
  const keyset = after
    ? Prisma.sql`AND (failed_at, id) < (${after.failed_at}::timestamptz, ${after.id}::uuid)`
    : Prisma.empty;

  return withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<DeadLetterEventRecord[]>`
      SELECT
        id,
        received_at,
        failed_at,
        failure_reason,
        raw IS NOT NULL AS payload_present
      FROM integration_events
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND status = 'FAILED'
      ${keyset}
      ORDER BY failed_at DESC, id DESC
      LIMIT ${limit}::integer
    `
  );
}

// An event's final state is no longer settled on its own: `applyIntakePlan`
// writes it in the same transaction as the rows it describes (ticket 09).
// A separate `markIntegrationEventProcessed` could only ever run before or
// after that commit, and either order leaves a moment where the Integrações
// screen and the funnel disagree — a card with an event still reading
// RECEIVED, or the reverse. The named surface of ADR-0016 is deliberate, so
// the operation is gone rather than left exported with no caller.

/**
 * How long `IntegrationEvent.raw` survives after receipt (ADR-0014). Not a
 * column: the expiry date is always `received_at + PAYLOAD_RETENTION_DAYS`,
 * and `raw` being null has exactly one cause because it is written on
 * receipt, before the 200 — there is no path onto which an event exists
 * without it. The Integrações screen derives "when the content left" from
 * this constant instead of storing a date that could disagree with reality.
 */
export const PAYLOAD_RETENTION_DAYS = 90;

/** `received_at + PAYLOAD_RETENTION_DAYS`, the one place that formula lives. */
export function integrationEventPayloadExpiresAt(received_at: Date): Date {
  return new Date(received_at.getTime() + PAYLOAD_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

/**
 * Thrown by `requeueIntegrationEventForReprocessing` when `raw` already
 * expired. A dedicated type instead of a string match lets the route handler
 * show *when* the content left without re-deriving the date itself.
 */
export class IntegrationEventPayloadExpiredError extends Error {
  readonly integration_event_id: string;
  readonly received_at: Date;
  readonly expired_at: Date;

  constructor(integration_event_id: string, received_at: Date) {
    const expired_at = integrationEventPayloadExpiresAt(received_at);
    super(
      `The payload for integration event ${integration_event_id} expired on ` +
        `${expired_at.toISOString()} (ADR-0014); it cannot be reprocessed.`
    );
    this.name = "IntegrationEventPayloadExpiredError";
    this.integration_event_id = integration_event_id;
    this.received_at = received_at;
    this.expired_at = expired_at;
  }
}

/**
 * The most recent instant a lead actually made it into the funnel — Gestão's
 * "is this thing still working" question, answered without walking the whole
 * history page the screen already renders.
 */
export async function getLastSuccessfulSyncAt(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<Date | null> {
  if (context.role !== "OWNER" && context.role !== "MANAGER") {
    throw new Error("Only MANAGER or OWNER can read the last successful sync");
  }

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<Array<{ processed_at: Date }>>`
      SELECT processed_at
      FROM integration_events
      WHERE status = 'PROCESSED'
      ORDER BY processed_at DESC
      LIMIT 1
    `
  );
  return rows[0]?.processed_at ?? null;
}

/**
 * Puts an event back in front of the same dispatcher, "sem caminho paralelo"
 * (ADR-0007): it only ever resets `dispatch_status` to `PENDING`, the exact
 * column `private.claim_pending_events` already scans. There is no second
 * queue and no direct call into the worker from here — the button on the
 * Integrações screen and the sweep that recovers after a Redis outage are the
 * same mechanism, reached from two places.
 *
 * An event in the dead letter also leaves it here: `FAILED` goes back to
 * `RECEIVED` and the reason is cleared. Reprocessing a failure that stayed
 * labelled failed would leave the screen showing a queue nobody can empty,
 * and the next real failure would overwrite a reason the operator never saw
 * resolve.
 *
 * Refuses — with the instant the content left — when `raw` already expired
 * instead of requeuing a job the worker could never interpret (ADR-0014).
 * That is the **only** refusal: an event that is `PROCESSED` or `QUARANTINED`
 * is still safe to requeue, because the worker's own idempotency (a
 * `PROCESSED` event returns immediately, `recordLeadSubmission`'s constraint
 * arbitrates the rest) is what makes "reprocessar" safe to offer without this
 * operation having to first guess what state is sensible to retry from.
 */
export async function requeueIntegrationEventForReprocessing(
  context: UserContext,
  integration_event_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  if (context.role !== "OWNER" && context.role !== "MANAGER") {
    throw new Error("Only MANAGER or OWNER can reprocess an integration event");
  }
  assertUuid(integration_event_id, "integration_event_id");

  await withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ raw: unknown; received_at: Date }>>`
      SELECT raw, received_at
      FROM integration_events
      WHERE id = ${integration_event_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
    `;
    const event = rows[0];
    if (!event) {
      throw new Error(EVENT_NOT_VISIBLE);
    }
    if (event.raw === null) {
      throw new IntegrationEventPayloadExpiredError(integration_event_id, event.received_at);
    }

    const updated = await transaction.$executeRaw`
      UPDATE integration_events
      SET dispatch_status = 'PENDING',
          dispatched_at = NULL,
          status = CASE WHEN status = 'FAILED' THEN 'RECEIVED'::integration_event_status
                        ELSE status END,
          failed_at = NULL,
          failure_reason = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${integration_event_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
    `;
    if (updated === 0) {
      throw new Error(EVENT_NOT_VISIBLE);
    }
  });
}
