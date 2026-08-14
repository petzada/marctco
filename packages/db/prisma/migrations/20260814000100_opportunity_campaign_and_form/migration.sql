-- Ticket 02: campaign and form (id and name) on the Opportunity. Nullable
-- text, expand/contract. No new policy — the existing
-- opportunities_workspace_isolation covers every column. No SECURITY DEFINER.
SET ROLE marctco_migrator;

ALTER TABLE opportunities
  ADD COLUMN campaign_id text,
  ADD COLUMN campaign_name text,
  ADD COLUMN form_id text,
  ADD COLUMN form_name text;

RESET ROLE;
