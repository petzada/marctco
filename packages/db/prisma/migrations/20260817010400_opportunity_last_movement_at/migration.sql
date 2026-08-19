-- Ticket 04: stagnation clock and movement facts on the Opportunity timeline.
-- Expand/contract — nullable last_movement_at, backfill to arrived_at so no
-- existing lead is born "stagnant since 1970" or "moved just now".
-- Unique ingestion dedupe becomes a partial index on the two intake variants.
-- provision_workspace is not touched.
SET ROLE marctco_migrator;

ALTER TABLE "opportunities" ADD COLUMN "last_movement_at" TIMESTAMPTZ(6);

UPDATE "opportunities"
SET "last_movement_at" = "arrived_at"
WHERE "last_movement_at" IS NULL;

ALTER TYPE "opportunity_timeline_event_type" ADD VALUE 'STAGE_CHANGED';
ALTER TYPE "opportunity_timeline_event_type" ADD VALUE 'ASSIGNED';
ALTER TYPE "opportunity_timeline_event_type" ADD VALUE 'REASSIGNED';
ALTER TYPE "opportunity_timeline_event_type" ADD VALUE 'RETURNED_TO_QUEUE';
ALTER TYPE "opportunity_timeline_event_type" ADD VALUE 'ACTIVITY_CREATED';
ALTER TYPE "opportunity_timeline_event_type" ADD VALUE 'ACTIVITY_COMPLETED';

ALTER TABLE "opportunity_timeline_events"
  ALTER COLUMN "lead_submission_id" DROP NOT NULL,
  ALTER COLUMN "integration_event_id" DROP NOT NULL;

ALTER TABLE "opportunity_timeline_events"
  DROP CONSTRAINT "opportunity_timeline_events_workspace_id_type_integration_e_key";

CREATE UNIQUE INDEX "opportunity_timeline_events_ingestion_dedupe_idx"
  ON "opportunity_timeline_events" ("workspace_id", "type", "integration_event_id")
  WHERE "type" IN (
    'RETRANSMISSION_RECEIVED'::opportunity_timeline_event_type,
    'SUBMISSION_REENTERED'::opportunity_timeline_event_type
  )
  AND "integration_event_id" IS NOT NULL;

CREATE INDEX "opportunities_workspace_id_last_movement_at_open_idx"
  ON "opportunities" ("workspace_id", "last_movement_at")
  WHERE "status" = 'OPEN'
    AND "merged_into_opportunity_id" IS NULL;

RESET ROLE;
