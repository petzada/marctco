-- Ticket 11: possible-duplicate resolutions and the two ingestion facts that
-- must survive on an Opportunity timeline. All changes are additive; pending
-- reviews remain pending and existing cards keep their state.
SET ROLE marctco_migrator;

CREATE TYPE possible_duplicate_resolution AS ENUM (
  'NEW_FINANCING',
  'SAME_FINANCING',
  'INVALID_OR_SPAM'
);

CREATE TYPE opportunity_timeline_event_type AS ENUM (
  'RETRANSMISSION_RECEIVED',
  'SUBMISSION_REENTERED'
);

-- Required by the composite FK from the timeline. `id` is already a primary
-- key, so existing rows cannot violate this additive tenant-qualified key.
ALTER TABLE lead_submissions
  ADD CONSTRAINT lead_submissions_workspace_id_id_key UNIQUE (workspace_id, id);

ALTER TABLE intake_reviews
  ADD COLUMN resolution possible_duplicate_resolution,
  ADD COLUMN resolved_by_user_id UUID,
  ADD COLUMN resolved_at TIMESTAMPTZ(6),
  ADD COLUMN resolution_reason TEXT;

ALTER TABLE intake_reviews
  DROP CONSTRAINT intake_reviews_type_carries_its_own_evidence;

ALTER TABLE intake_reviews
  ADD CONSTRAINT intake_reviews_type_carries_its_own_evidence CHECK (
    (
      type = 'IDENTITY_CONFLICT'
      AND cardinality(candidate_person_ids) > 0
      AND related_opportunity_id IS NULL
      AND resolution IS NULL
    )
    OR (
      type = 'POSSIBLE_DUPLICATE'
      AND cardinality(candidate_person_ids) = 0
      AND (
        related_opportunity_id IS NOT NULL
        OR resolution = 'SAME_FINANCING'
      )
    )
  );

ALTER TABLE intake_reviews
  ADD CONSTRAINT intake_reviews_resolution_audit_is_complete CHECK (
    (
      resolution IS NULL
      AND resolved_by_user_id IS NULL
      AND resolved_at IS NULL
      AND resolution_reason IS NULL
    )
    OR (
      resolution IS NOT NULL
      AND resolved_by_user_id IS NOT NULL
      AND resolved_at IS NOT NULL
      AND length(btrim(resolution_reason)) > 0
    )
  );

CREATE TABLE opportunity_timeline_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  type opportunity_timeline_event_type NOT NULL,
  lead_submission_id UUID NOT NULL,
  integration_event_id UUID NOT NULL,
  occurred_at TIMESTAMPTZ(6) NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT opportunity_timeline_events_pkey PRIMARY KEY (id),
  CONSTRAINT opportunity_timeline_events_workspace_id_type_integration_e_key
    UNIQUE (workspace_id, type, integration_event_id),
  CONSTRAINT opportunity_timeline_events_workspace_id_fkey
    FOREIGN KEY (workspace_id)
    REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT opportunity_timeline_events_workspace_id_opportunity_id_fkey
    FOREIGN KEY (workspace_id, opportunity_id)
    REFERENCES opportunities(workspace_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT opportunity_timeline_events_workspace_id_lead_submission_i_fkey
    FOREIGN KEY (workspace_id, lead_submission_id)
    REFERENCES lead_submissions(workspace_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT opportunity_timeline_events_workspace_id_integration_event_fkey
    FOREIGN KEY (workspace_id, integration_event_id)
    REFERENCES integration_events(workspace_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION
);

CREATE INDEX opportunity_timeline_events_workspace_id_idx
  ON opportunity_timeline_events(workspace_id);
CREATE INDEX opportunity_timeline_events_workspace_id_opportunity_id_occ_idx
  ON opportunity_timeline_events(workspace_id, opportunity_id, occurred_at DESC, id DESC);
CREATE INDEX opportunity_timeline_events_workspace_id_lead_submission_id_idx
  ON opportunity_timeline_events(workspace_id, lead_submission_id);
CREATE INDEX opportunity_timeline_events_workspace_id_integration_event__idx
  ON opportunity_timeline_events(workspace_id, integration_event_id);

ALTER TABLE opportunity_timeline_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunity_timeline_events FORCE ROW LEVEL SECURITY;
CREATE POLICY opportunity_timeline_events_workspace_isolation
  ON opportunity_timeline_events
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE possible_duplicate_resolution, opportunity_timeline_event_type
  TO marctco_app, marctco_worker;
-- A Pessoa merge removes only contact rows whose normalized value already
-- exists on the canonical Pessoa; every distinct row is transferred.
GRANT DELETE ON TABLE person_phones, person_emails TO marctco_app;

RESET ROLE;
