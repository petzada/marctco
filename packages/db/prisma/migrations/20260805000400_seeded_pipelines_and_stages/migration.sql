SET ROLE marctco_migrator;

CREATE TYPE financing_type AS ENUM ('VEHICLE', 'REAL_ESTATE', 'PERSONAL_LOAN', 'OTHER');
CREATE TYPE pipeline_type AS ENUM ('COMMERCIAL', 'LEGAL');
CREATE TYPE stage_role AS ENUM ('ENTRY', 'CLOSING', 'LEGAL_HANDOFF', 'NORMAL');

CREATE TABLE pipelines (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  type pipeline_type NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT pipelines_pkey PRIMARY KEY (id),
  CONSTRAINT pipelines_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT pipelines_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT pipelines_default_must_be_commercial CHECK (NOT is_default OR type = 'COMMERCIAL')
);

CREATE TABLE stages (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  pipeline_id UUID NOT NULL,
  label TEXT NOT NULL,
  position INTEGER NOT NULL,
  role stage_role NOT NULL DEFAULT 'NORMAL',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT stages_pkey PRIMARY KEY (id),
  CONSTRAINT stages_pipeline_id_position_key UNIQUE (pipeline_id, position) DEFERRABLE INITIALLY DEFERRED,
  CONSTRAINT stages_workspace_id_pipeline_id_fkey
    FOREIGN KEY (workspace_id, pipeline_id)
    REFERENCES pipelines(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT stages_position_positive CHECK (position > 0)
);

CREATE INDEX pipelines_workspace_id_idx ON pipelines(workspace_id);
CREATE INDEX stages_workspace_id_idx ON stages(workspace_id);
CREATE INDEX stages_workspace_id_pipeline_id_idx ON stages(workspace_id, pipeline_id);
CREATE UNIQUE INDEX pipelines_one_default_commercial_per_workspace
  ON pipelines(workspace_id)
  WHERE type = 'COMMERCIAL' AND is_default;
CREATE UNIQUE INDEX stages_one_entry_per_pipeline
  ON stages(pipeline_id)
  WHERE role = 'ENTRY';

ALTER TABLE pipelines ENABLE ROW LEVEL SECURITY;
ALTER TABLE pipelines FORCE ROW LEVEL SECURITY;
CREATE POLICY pipelines_workspace_isolation ON pipelines
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

ALTER TABLE stages ENABLE ROW LEVEL SECURITY;
ALTER TABLE stages FORCE ROW LEVEL SECURITY;
CREATE POLICY stages_workspace_isolation ON stages
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE financing_type, pipeline_type, stage_role TO marctco_app, marctco_worker;
GRANT DELETE ON TABLE pipelines, stages TO marctco_app;

CREATE FUNCTION private.assert_pipeline_stage_invariants()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  affected_workspace_id UUID;
  affected_pipeline_id UUID;
  entry_count INTEGER;
  closing_count INTEGER;
BEGIN
  IF TG_OP = 'DELETE' THEN
    affected_workspace_id := OLD.workspace_id;
    affected_pipeline_id := OLD.pipeline_id;
  ELSE
    affected_workspace_id := NEW.workspace_id;
    affected_pipeline_id := NEW.pipeline_id;
  END IF;

  -- A cascade from deleting its parent Pipeline needs no replacement.
  IF NOT EXISTS (
    SELECT 1
    FROM public.pipelines
    WHERE id = affected_pipeline_id AND workspace_id = affected_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT
    COUNT(*) FILTER (WHERE role = 'ENTRY'),
    COUNT(*) FILTER (WHERE role = 'CLOSING')
  INTO entry_count, closing_count
  FROM public.stages
  WHERE pipeline_id = affected_pipeline_id AND workspace_id = affected_workspace_id;

  IF entry_count <> 1 THEN
    RAISE EXCEPTION 'pipeline % must have exactly one ENTRY stage', affected_pipeline_id;
  END IF;
  IF closing_count < 1 THEN
    RAISE EXCEPTION 'pipeline % must have at least one CLOSING stage', affected_pipeline_id;
  END IF;

  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER stages_require_entry_and_closing
AFTER INSERT OR UPDATE OR DELETE ON stages
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.assert_pipeline_stage_invariants();

CREATE FUNCTION private.assert_workspace_default_commercial_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  affected_workspace_id UUID;
  default_count INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'workspaces' AND TG_OP = 'DELETE' THEN
    affected_workspace_id := OLD.id;
  ELSIF TG_TABLE_NAME = 'workspaces' THEN
    affected_workspace_id := NEW.id;
  ELSIF TG_OP = 'DELETE' THEN
    affected_workspace_id := OLD.workspace_id;
  ELSE
    affected_workspace_id := NEW.workspace_id;
  END IF;

  -- A workspace cascade removes the tenant itself, so it has no invariant
  -- left to satisfy. Provisioning creates workspace + default pipeline atomically.
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = affected_workspace_id) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*)
  INTO default_count
  FROM public.pipelines
  WHERE workspace_id = affected_workspace_id
    AND type = 'COMMERCIAL'
    AND is_default;

  IF default_count <> 1 THEN
    RAISE EXCEPTION 'workspace % must have exactly one default commercial pipeline', affected_workspace_id;
  END IF;

  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER pipelines_require_one_default_commercial
AFTER INSERT OR UPDATE OR DELETE ON pipelines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.assert_workspace_default_commercial_pipeline();

CREATE CONSTRAINT TRIGGER workspaces_require_one_default_commercial
AFTER INSERT OR DELETE ON workspaces
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.assert_workspace_default_commercial_pipeline();

REVOKE ALL ON FUNCTION private.assert_pipeline_stage_invariants() FROM PUBLIC;
REVOKE ALL ON FUNCTION private.assert_workspace_default_commercial_pipeline() FROM PUBLIC;

RESET ROLE;
