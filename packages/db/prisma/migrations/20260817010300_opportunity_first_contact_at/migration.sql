-- Ticket 03: first-contact clock. Expand/contract — nullable column, no
-- backfill. The partial index lives only here: Prisma's @@index cannot
-- express a WHERE predicate, and declaring a full index would lie about
-- migration history. provision_workspace is not touched.
SET ROLE marctco_migrator;

ALTER TABLE "opportunities" ADD COLUMN "first_contact_at" TIMESTAMPTZ(6);

CREATE INDEX "opportunities_workspace_id_arrived_at_first_contact_pending_idx"
  ON "opportunities" ("workspace_id", "arrived_at")
  WHERE "first_contact_at" IS NULL
    AND "status" = 'OPEN'
    AND "merged_into_opportunity_id" IS NULL;

RESET ROLE;
