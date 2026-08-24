import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { LeadSource } from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import type { IntegrationProvider } from "./integration-connection.js";
import { withAccessContext } from "./internal/scoped-transaction.js";
import { assertUuid } from "./internal/uuid.js";

const sharedPrisma = createPrismaClient();
const MAX_QUARANTINE_PAGE = 200;
const DEFAULT_QUARANTINE_PAGE = 50;
const NOT_QUARANTINED =
  "This event is not currently in quarantine — it may already have been released, or a newer transmission superseded it";

function assertQuarantineReader(context: UserContext): void {
  if (context.role !== "OWNER" && context.role !== "MANAGER") {
    throw new Error("Only MANAGER or OWNER can read the quarantine queue");
  }
}

/**
 * Everything "completar e liberar" needs about one quarantined lead: the raw
 * payload to read beside the form, and the identity (`source` +
 * `external_lead_id`) the release must preserve rather than reinvent
 * (ADR-0017, ADR-0008). `target_pipeline_id` rides along for
 * `resolveIntakeDestination`, the same read the worker's job makes.
 */
export interface QuarantinedEvent {
  readonly integration_event_id: string;
  /**
   * The connection that authenticated the original send. The release must
   * reuse it, not re-derive it: it is half of the key the earlier
   * `recordLeadSubmission` wrote (ADR-0031).
   */
  readonly integration_connection_id: string;
  readonly lead_submission_id: string;
  readonly received_at: Date;
  /**
   * Never null here: an event this query returns is still `QUARANTINED`, and
   * ADR-0014's exception is exact — quarantine does not expire while it is
   * quarantine.
   */
  readonly raw: unknown;
  readonly provider: IntegrationProvider;
  readonly target_pipeline_id: string | null;
  readonly source: LeadSource;
  readonly external_lead_id: string;
}

interface QuarantinedEventRow {
  readonly integration_event_id: string;
  readonly integration_connection_id: string;
  readonly lead_submission_id: string;
  readonly received_at: Date;
  readonly raw: unknown;
  readonly provider: IntegrationProvider;
  readonly target_pipeline_id: string | null;
  readonly source: LeadSource;
  readonly external_lead_id: string;
}

/**
 * One of the nine named operations ticket 03 tracked as carried debt
 * (`.scratch/fundacao-e-ingestao/registro.md`, "Pendências carregadas do
 * ticket 03", now on the `docs/arquivo-fases-0-4` branch). MANAGER and up (ADR-0015).
 *
 * Reads `source`/`external_lead_id` from `lead_submissions` rather than
 * re-parsing `raw`: that pair is the submission's committed identity, the
 * same one `planSubmission` derived when the lead first arrived, and the
 * release must preserve it — not recompute a value that could disagree with
 * the row `recordLeadSubmission` is about to look up.
 *
 * Joins on `lead_submissions.last_integration_event_id = event.id` so an
 * older, superseded quarantine event (ticket 10: "aponta para a transmissão
 * mais recente") throws instead of quietly completing the wrong one.
 */
export async function getQuarantinedEvent(
  context: UserContext,
  integration_event_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<QuarantinedEvent> {
  assertQuarantineReader(context);
  assertUuid(integration_event_id, "integration_event_id");

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<QuarantinedEventRow[]>`
      SELECT
        event.id AS integration_event_id,
        event.integration_connection_id,
        submission.id AS lead_submission_id,
        event.received_at,
        event.raw,
        connection.provider::text AS provider,
        connection.target_pipeline_id,
        submission.source::text AS source,
        submission.external_lead_id
      FROM integration_events AS event
      JOIN integration_connections AS connection
        ON connection.workspace_id = event.workspace_id
       AND connection.id = event.integration_connection_id
      JOIN lead_submissions AS submission
        ON submission.workspace_id = event.workspace_id
       AND submission.last_integration_event_id = event.id
      WHERE event.id = ${integration_event_id}::uuid
        AND event.status = 'QUARANTINED'
    `
  );
  const row = rows[0];
  if (!row) {
    throw new Error(NOT_QUARANTINED);
  }
  return row;
}

/** What the queue shows before a manager opens one card to complete it. */
export interface QuarantinedEventSummary {
  readonly integration_event_id: string;
  readonly lead_submission_id: string;
  readonly received_at: Date;
  readonly source: LeadSource;
  readonly external_lead_id: string;
}

interface QuarantinedEventSummaryRow {
  readonly integration_event_id: string;
  readonly lead_submission_id: string;
  readonly received_at: Date;
  readonly source: LeadSource;
  readonly external_lead_id: string;
}

/** The keyset a caller carries to ask for the page after this row (ADR-0013). */
export interface QuarantinedEventCursor {
  readonly received_at: Date;
  readonly id: string;
}

export interface ListQuarantinedEventsOptions {
  readonly limit?: number;
  readonly after?: QuarantinedEventCursor;
}

/**
 * The quarantine queue, oldest first: the lead that has waited longest for a
 * contact is the one closest to being genuinely unrecoverable, so it leads
 * the list rather than the most recent arrival (the opposite order from
 * `listIntegrationEvents`, which reads newest-first history). Keyset
 * paginated, never `OFFSET` (ADR-0013) — the queue keeps growing while a
 * manager works it.
 *
 * MANAGER and up (ADR-0015). Only the current quarantine per submission is
 * listed, via the same join `getQuarantinedEvent` uses.
 */
export async function listQuarantinedEvents(
  context: UserContext,
  options: ListQuarantinedEventsOptions = {},
  prisma: PrismaClient = sharedPrisma
): Promise<QuarantinedEventSummary[]> {
  assertQuarantineReader(context);
  const limit = options.limit ?? DEFAULT_QUARANTINE_PAGE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_QUARANTINE_PAGE) {
    throw new Error(`limit must be an integer between 1 and ${MAX_QUARANTINE_PAGE}`);
  }
  if (options.after) {
    assertUuid(options.after.id, "after.id");
    if (Number.isNaN(options.after.received_at.getTime())) {
      throw new Error("after.received_at must be a valid instant");
    }
  }

  const after = options.after;
  const keyset = after
    ? Prisma.sql`AND (event.received_at, event.id) > (${after.received_at}::timestamptz, ${after.id}::uuid)`
    : Prisma.empty;

  return withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<QuarantinedEventSummaryRow[]>`
      SELECT
        event.id AS integration_event_id,
        event.integration_connection_id,
        submission.id AS lead_submission_id,
        event.received_at,
        submission.source::text AS source,
        submission.external_lead_id
      FROM integration_events AS event
      JOIN lead_submissions AS submission
        ON submission.workspace_id = event.workspace_id
       AND submission.last_integration_event_id = event.id
      WHERE event.status = 'QUARANTINED'
      ${keyset}
      ORDER BY event.received_at ASC, event.id ASC
      LIMIT ${limit}::integer
    `
  );
}
