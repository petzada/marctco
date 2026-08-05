-- Migration 004 was applied in development before the workspace-level part of
-- this invariant was added. Keep this upgrade idempotent so a fresh database
-- (which receives the complete 004) and that database converge to the same
-- schema.
SET ROLE marctco_migrator;

CREATE OR REPLACE FUNCTION private.assert_workspace_default_commercial_pipeline()
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

DO $block$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.pipelines'::regclass
      AND conname = 'pipelines_default_must_be_commercial'
  ) THEN
    ALTER TABLE public.pipelines
      ADD CONSTRAINT pipelines_default_must_be_commercial
      CHECK (NOT is_default OR type = 'COMMERCIAL');
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_trigger
    WHERE tgrelid = 'public.workspaces'::regclass
      AND tgname = 'workspaces_require_one_default_commercial'
      AND NOT tgisinternal
  ) THEN
    EXECUTE
      'CREATE CONSTRAINT TRIGGER workspaces_require_one_default_commercial '
      || 'AFTER INSERT OR DELETE ON public.workspaces '
      || 'DEFERRABLE INITIALLY DEFERRED FOR EACH ROW '
      || 'EXECUTE FUNCTION private.assert_workspace_default_commercial_pipeline()';
  END IF;
END
$block$;

REVOKE ALL ON FUNCTION private.assert_workspace_default_commercial_pipeline() FROM PUBLIC;

RESET ROLE;
