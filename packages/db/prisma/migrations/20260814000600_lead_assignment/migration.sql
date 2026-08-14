-- Ticket 06: support the server-side assignee filter. The assignment trail
-- column was introduced by ticket 04 before this dependent ticket.
SET ROLE marctco_migrator;

CREATE INDEX opportunities_workspace_id_assigned_user_id_active_idx
  ON opportunities (workspace_id, assigned_user_id)
  WHERE merged_into_opportunity_id IS NULL;

RESET ROLE;
