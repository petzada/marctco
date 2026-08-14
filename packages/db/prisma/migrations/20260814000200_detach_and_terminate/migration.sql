-- Ticket 04: preserve the last assignee when an OPEN Opportunity returns to
-- the unassigned queue. The nullable UUID is deliberately not a foreign key:
-- it is historical context, not an active membership relation (ADR-0023).
SET ROLE marctco_migrator;

ALTER TABLE opportunities
  ADD COLUMN previous_assigned_user_id UUID;

CREATE INDEX opportunities_workspace_id_assigned_user_id_open_idx
  ON opportunities (workspace_id, assigned_user_id)
  WHERE status = 'OPEN' AND assigned_user_id IS NOT NULL;

RESET ROLE;
