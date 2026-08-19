-- Ticket 05: immutable assignment snapshots on timeline facts.
-- Expand/contract — nullable columns, no backfill. Pre-migration rows stay
-- null because the database does not record who each past hop went to;
-- inventing that from today's Opportunity would reconstruct facts from
-- current card state (CONTEXT.md). New writes copy typed ids from the
-- already-updated Opportunity row. provision_workspace is not touched.
SET ROLE marctco_migrator;

ALTER TABLE "opportunity_timeline_events" ADD COLUMN "assigned_user_id" UUID,
ADD COLUMN "previous_assigned_user_id" UUID;

CREATE INDEX "opportunity_timeline_events_workspace_id_assigned_user_id_idx" ON "opportunity_timeline_events"("workspace_id", "assigned_user_id");

CREATE INDEX "opportunity_timeline_events_workspace_id_previous_assigned__idx" ON "opportunity_timeline_events"("workspace_id", "previous_assigned_user_id");

ALTER TABLE "opportunity_timeline_events" ADD CONSTRAINT "opportunity_timeline_events_workspace_id_assigned_user_id_fkey" FOREIGN KEY ("workspace_id", "assigned_user_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunity_timeline_events" ADD CONSTRAINT "opportunity_timeline_events_workspace_id_previous_assigned_fkey" FOREIGN KEY ("workspace_id", "previous_assigned_user_id") REFERENCES "workspace_members"("workspace_id", "user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

RESET ROLE;
