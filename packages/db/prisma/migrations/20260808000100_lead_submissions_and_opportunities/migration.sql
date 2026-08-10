-- The tracer bullet closes: a submission becomes a Pessoa, and the Pessoa
-- becomes an Opportunity.
--
-- Three tables and one rule each. `lead_submissions` answers "have I already
-- received this transmission" and nothing else. `opportunities` is the card,
-- carrying the instant it came to exist because that instant is not
-- reconstructible later. `intake_reviews` is the pendency hung on a card that
-- already exists — a marker, never a gate (ADR-0007, ADR-0017).
SET ROLE marctco_migrator;

CREATE TYPE lead_source AS ENUM ('META_LEAD_ADS', 'GOOGLE_LEAD_FORM', 'LANDING_PAGE');
CREATE TYPE opportunity_status AS ENUM ('OPEN', 'WON', 'LOST');
CREATE TYPE opportunity_area AS ENUM ('COMMERCIAL', 'LEGAL');
CREATE TYPE intake_review_type AS ENUM ('IDENTITY_CONFLICT', 'POSSIBLE_DUPLICATE');

-- The composite keys the new rows reference, so a card can only ever point at
-- a stage and an event from inside its own workspace. Both columns are already
-- unique on their own; the pair is what a composite foreign key can target.
ALTER TABLE stages ADD CONSTRAINT stages_workspace_id_id_key UNIQUE (workspace_id, id);
ALTER TABLE integration_events
  ADD CONSTRAINT integration_events_workspace_id_id_key UNIQUE (workspace_id, id);

CREATE TABLE opportunities (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  person_id UUID NOT NULL,
  pipeline_id UUID NOT NULL,
  stage_id UUID NOT NULL,
  area opportunity_area NOT NULL,
  -- Orthogonal to the stage. Won and lost take the card off the Kanban; they
  -- are not columns of it (ADR-0009).
  status opportunity_status NOT NULL DEFAULT 'OPEN',
  -- Written from the day ingestion exists, though the SLA screen is Fase 3.
  -- The instant an Opportunity comes to exist cannot be recovered afterwards,
  -- and every lead received until then would be permanently without a clock.
  arrived_at TIMESTAMPTZ(6) NOT NULL,
  -- Born null. Assignment is Fase 2.
  assigned_user_id UUID,
  -- Means one thing only: there is no way to WhatsApp and no way to call. Not
  -- a generic "something is missing" label — as one it stops being operational
  -- (ADR-0007 §Quarentena).
  missing_phone BOOLEAN NOT NULL DEFAULT FALSE,
  -- Classification, never a funnel selector and never an identifier.
  financing_type financing_type,
  financial_institution TEXT,
  -- Unconstrained numeric on purpose: the domain produces an exact decimal
  -- string, and a mis-mapped field carrying an absurd number must not be able
  -- to overflow a width and cost the whole write.
  installment_amount NUMERIC,
  -- The tombstone of a SAME_FINANCING resolution (ticket 11). Two jobs only —
  -- take the row out of active views, preserve the trail — and never a third:
  -- it does not redirect a read.
  merged_into_opportunity_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT opportunities_pkey PRIMARY KEY (id),
  CONSTRAINT opportunities_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT opportunities_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT opportunities_workspace_id_person_id_fkey
    FOREIGN KEY (workspace_id, person_id)
    REFERENCES persons(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT opportunities_workspace_id_pipeline_id_fkey
    FOREIGN KEY (workspace_id, pipeline_id)
    REFERENCES pipelines(workspace_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT opportunities_workspace_id_stage_id_fkey
    FOREIGN KEY (workspace_id, stage_id)
    REFERENCES stages(workspace_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT opportunities_merge_points_elsewhere
    CHECK (merged_into_opportunity_id IS NULL OR merged_into_opportunity_id <> id)
);

-- Added after the table exists so the self-reference resolves. NO ACTION and
-- not RESTRICT, for the same reason as `persons`: RESTRICT is checked per row
-- and would make a workspace cascade fail against itself.
ALTER TABLE opportunities
  ADD CONSTRAINT opportunities_workspace_id_merged_into_opportunity_id_fkey
  FOREIGN KEY (workspace_id, merged_into_opportunity_id)
  REFERENCES opportunities(workspace_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE lead_submissions (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  source lead_source NOT NULL,
  -- NOT NULL always: in Postgres NULL does not collide with NULL in a unique
  -- index, so without a value the constraint would deduplicate nothing. When
  -- the origin supplies none, the connector uses the IntegrationEvent.id — no
  -- clock inside it, unique per request, identical on every reprocessing.
  external_lead_id VARCHAR(255) NOT NULL,
  -- Truth about the origin, kept even when it differs from the Opportunity's
  -- arrived_at. The wait in quarantine is the difference between the two.
  received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- The most recent transmission, instead of a second copy of the payload:
  -- the raw JSON is stored once, on the event (ADR-0014).
  last_integration_event_id UUID NOT NULL,
  transmission_count INTEGER NOT NULL DEFAULT 1,
  -- Null while this submission produced no card: quarantine, or a plan that
  -- has not been applied yet.
  opportunity_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT lead_submissions_pkey PRIMARY KEY (id),
  -- Mechanism 1 of ADR-0007, and the only arbiter of "already received". It
  -- leads with workspace_id, so a conflict is always intra-tenant and the
  -- constraint can never become an existence oracle across workspaces.
  CONSTRAINT lead_submissions_workspace_id_source_external_lead_id_key
    UNIQUE (workspace_id, source, external_lead_id),
  CONSTRAINT lead_submissions_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT lead_submissions_workspace_id_last_integration_event_id_fkey
    FOREIGN KEY (workspace_id, last_integration_event_id)
    REFERENCES integration_events(workspace_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT lead_submissions_workspace_id_opportunity_id_fkey
    FOREIGN KEY (workspace_id, opportunity_id)
    REFERENCES opportunities(workspace_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  CONSTRAINT lead_submissions_external_lead_id_is_present
    CHECK (length(external_lead_id) > 0)
);

CREATE TABLE intake_reviews (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  type intake_review_type NOT NULL,
  candidate_person_ids UUID[] NOT NULL DEFAULT '{}',
  related_opportunity_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT intake_reviews_pkey PRIMARY KEY (id),
  CONSTRAINT intake_reviews_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT intake_reviews_workspace_id_opportunity_id_fkey
    FOREIGN KEY (workspace_id, opportunity_id)
    REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT intake_reviews_workspace_id_related_opportunity_id_fkey
    FOREIGN KEY (workspace_id, related_opportunity_id)
    REFERENCES opportunities(workspace_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION,
  -- The discriminated union of the plan, restated where the row lands. An
  -- IDENTITY_CONFLICT without its candidates is a review nobody can resolve,
  -- and a POSSIBLE_DUPLICATE without the other card is a warning that points
  -- at nothing.
  CONSTRAINT intake_reviews_type_carries_its_own_evidence CHECK (
    (
      type = 'IDENTITY_CONFLICT'
      AND cardinality(candidate_person_ids) > 0
      AND related_opportunity_id IS NULL
    )
    OR (
      type = 'POSSIBLE_DUPLICATE'
      AND cardinality(candidate_person_ids) = 0
      AND related_opportunity_id IS NOT NULL
    )
  ),
  CONSTRAINT intake_reviews_relates_to_another_card
    CHECK (related_opportunity_id IS NULL OR related_opportunity_id <> opportunity_id)
);

CREATE INDEX opportunities_workspace_id_idx ON opportunities(workspace_id);
-- "Which open cards does this Pessoa already have" — the read that decides
-- whether a second submission is born linked to the first.
CREATE INDEX opportunities_workspace_id_person_id_idx
  ON opportunities(workspace_id, person_id);
CREATE INDEX opportunities_workspace_id_stage_id_idx ON opportunities(workspace_id, stage_id);
CREATE INDEX opportunities_workspace_id_merged_into_opportunity_id_idx
  ON opportunities(workspace_id, merged_into_opportunity_id);

CREATE INDEX lead_submissions_workspace_id_idx ON lead_submissions(workspace_id);
CREATE INDEX lead_submissions_workspace_id_opportunity_id_idx
  ON lead_submissions(workspace_id, opportunity_id);
CREATE INDEX lead_submissions_workspace_id_last_integration_event_id_idx
  ON lead_submissions(workspace_id, last_integration_event_id);

CREATE INDEX intake_reviews_workspace_id_idx ON intake_reviews(workspace_id);
CREATE INDEX intake_reviews_workspace_id_opportunity_id_idx
  ON intake_reviews(workspace_id, opportunity_id);
-- The counters at the top of the Leads table ask "which leads carry this
-- warning", which is a different question from "what does this lead have".
CREATE INDEX intake_reviews_workspace_id_type_idx ON intake_reviews(workspace_id, type);

ALTER TABLE opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE opportunities FORCE ROW LEVEL SECURITY;
CREATE POLICY opportunities_workspace_isolation ON opportunities
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

ALTER TABLE lead_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE lead_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY lead_submissions_workspace_isolation ON lead_submissions
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

ALTER TABLE intake_reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE intake_reviews FORCE ROW LEVEL SECURITY;
CREATE POLICY intake_reviews_workspace_isolation ON intake_reviews
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

RESET ROLE;
