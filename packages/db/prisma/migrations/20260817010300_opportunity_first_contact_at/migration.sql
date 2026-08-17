-- Ticket 03: first-contact clock and close instant for SLA freeze.
-- Expand/contract — nullable columns, no backfill on first_contact_at.
-- The partial index lives only here: Prisma's @@index cannot express a
-- WHERE predicate. provision_workspace is not touched.
SET ROLE marctco_migrator;

ALTER TABLE "opportunities" ADD COLUMN "first_contact_at" TIMESTAMPTZ(6);
ALTER TABLE "opportunities" ADD COLUMN "closed_at" TIMESTAMPTZ(6);

-- Rows already closed before closed_at existed: one-time archaeology only.
-- Runtime SLA never reads updated_at; this backfill unblocks the CHECK below.
UPDATE "opportunities"
SET "closed_at" = "updated_at"
WHERE "status" IN ('WON', 'LOST')
  AND "closed_at" IS NULL;

ALTER TABLE "opportunities"
  ADD CONSTRAINT "opportunities_closed_at_status_check"
  CHECK (
    ("status" = 'OPEN'::opportunity_status AND "closed_at" IS NULL)
    OR ("status" IN ('WON', 'LOST') AND "closed_at" IS NOT NULL)
  );

CREATE INDEX "opportunities_workspace_id_arrived_at_first_contact_pending_idx"
  ON "opportunities" ("workspace_id", "arrived_at")
  WHERE "first_contact_at" IS NULL
    AND "status" = 'OPEN'
    AND "merged_into_opportunity_id" IS NULL;

RESET ROLE;
