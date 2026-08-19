import { Prisma } from "@prisma/client";
import type { ScopedTransactionClient } from "./scoped-transaction.js";

export const MOVEMENT_EVENT_TYPES = [
  "STAGE_CHANGED",
  "ASSIGNED",
  "REASSIGNED",
  "RETURNED_TO_QUEUE",
  "ACTIVITY_CREATED",
  "ACTIVITY_COMPLETED"
] as const;

export type MovementEventType = (typeof MOVEMENT_EVENT_TYPES)[number];

/**
 * The arbiter for ingestion timeline dedupe after ticket 04: a partial
 * unique index on the two intake variants, not a table-wide unique on
 * `(workspace_id, type, integration_event_id)`. Movement facts have a null
 * integration event and must not collide with one another.
 */
export const ingestionTimelineConflictTarget = Prisma.sql`
  ON CONFLICT (workspace_id, type, integration_event_id)
  WHERE type IN (
    'RETRANSMISSION_RECEIVED'::opportunity_timeline_event_type,
    'SUBMISSION_REENTERED'::opportunity_timeline_event_type
  )
  AND integration_event_id IS NOT NULL
  DO NOTHING
`;

/**
 * Stamps `last_movement_at` and writes one immutable movement fact per
 * opportunity, in the same transaction the caller already opened. Empty
 * id lists are a no-op so batch operations that claimed nothing do not
 * insert a stray row.
 */
export async function stampOpportunityMovement(
  transaction: ScopedTransactionClient,
  input: {
    readonly workspace_id: string;
    readonly opportunity_ids: readonly string[];
    readonly type: MovementEventType;
  }
): Promise<void> {
  if (input.opportunity_ids.length === 0) {
    return;
  }

  const ids = Prisma.join(input.opportunity_ids.map((id) => Prisma.sql`${id}::uuid`));
  await transaction.$executeRaw(Prisma.sql`
    WITH stamped AS (
      UPDATE opportunities
      SET
        last_movement_at = CURRENT_TIMESTAMP,
        updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${input.workspace_id}::uuid
        AND id IN (${ids})
      RETURNING id, workspace_id, last_movement_at
    )
    INSERT INTO opportunity_timeline_events (
      workspace_id, opportunity_id, type, lead_submission_id,
      integration_event_id, occurred_at
    )
    SELECT
      stamped.workspace_id,
      stamped.id,
      ${input.type}::opportunity_timeline_event_type,
      NULL,
      NULL,
      stamped.last_movement_at
    FROM stamped
  `);
}
