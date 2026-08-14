-- The lock still serializes by owner. The lookup inside it now matches an
-- OWNER membership on a workspace of this same name, so a marked Direção can
-- receive a second tenant without losing the first (ADR-0022). Same name is
-- still a double-click, not a second house. Signature, owner, grants and the
-- advisory lock stay as they were — this is not a sixth SECURITY DEFINER
-- (ADR-0019).
DO $schema_grants$
BEGIN
  IF NOT has_schema_privilege('marctco_provisioner', 'private', 'CREATE') THEN
    GRANT CREATE ON SCHEMA private TO marctco_provisioner;
  END IF;
END
$schema_grants$;

SET ROLE marctco_provisioner;

CREATE OR REPLACE FUNCTION private.provision_workspace(
  owner_user_id UUID,
  workspace_name TEXT,
  default_pipeline JSONB
)
RETURNS TABLE(workspace_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
DECLARE
  requested_name TEXT := btrim(COALESCE(workspace_name, ''));
  existing_workspace_id UUID;
  new_workspace_id UUID;
  new_pipeline_id UUID;
BEGIN
  IF owner_user_id IS NULL THEN
    RAISE EXCEPTION 'provision_workspace requires an owner_user_id';
  END IF;
  IF requested_name = '' THEN
    RAISE EXCEPTION 'provision_workspace requires a non-empty workspace_name';
  END IF;
  IF default_pipeline IS NULL OR jsonb_typeof(default_pipeline -> 'stages') <> 'array' THEN
    RAISE EXCEPTION 'provision_workspace requires the pipeline definition from packages/domain';
  END IF;

  -- Two clicks or two tabs reach here concurrently. Belonging to several
  -- workspaces is legitimate (ADR-0012, ADR-0022), so no unique index can
  -- express "this owner has not already created this name". The database
  -- still arbitrates through a lock rather than a constraint: serializing by
  -- owner makes the second caller read the first caller's OWNER row for this
  -- same name instead of inserting a second tenant.
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_user_id::text, 0));

  SELECT member.workspace_id
  INTO existing_workspace_id
  FROM public.workspace_members AS member
  INNER JOIN public.workspaces AS workspace
    ON workspace.id = member.workspace_id
  WHERE member.user_id = owner_user_id
    AND member.role = 'OWNER'
    AND workspace.name = requested_name
  ORDER BY member.created_at, member.workspace_id
  LIMIT 1;

  IF existing_workspace_id IS NOT NULL THEN
    workspace_id := existing_workspace_id;
    RETURN NEXT;
    RETURN;
  END IF;

  INSERT INTO public.workspaces (name, updated_at)
  VALUES (requested_name, CURRENT_TIMESTAMP)
  RETURNING id INTO new_workspace_id;

  -- The deferred invariants — one default commercial pipeline per workspace,
  -- one ENTRY and at least one CLOSING per pipeline — are constraint triggers
  -- that fire at COMMIT, after this SECURITY DEFINER context is gone and under
  -- the calling role's policies. Scoping the transaction to the workspace just
  -- created is what lets them read the rows they must validate, and it is the
  -- same workspace this caller is now the OWNER of.
  PERFORM set_config('app.workspace_id', new_workspace_id::text, true);

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (new_workspace_id, owner_user_id, 'OWNER');

  INSERT INTO public.pipelines (workspace_id, name, type, is_default, updated_at)
  VALUES (
    new_workspace_id,
    default_pipeline ->> 'name',
    (default_pipeline ->> 'type')::public.pipeline_type,
    COALESCE((default_pipeline ->> 'is_default')::boolean, false),
    CURRENT_TIMESTAMP
  )
  RETURNING id INTO new_pipeline_id;

  INSERT INTO public.stages (workspace_id, pipeline_id, label, position, role, updated_at)
  SELECT
    new_workspace_id,
    new_pipeline_id,
    stage ->> 'label',
    (stage ->> 'position')::integer,
    (stage ->> 'role')::public.stage_role,
    CURRENT_TIMESTAMP
  FROM jsonb_array_elements(default_pipeline -> 'stages') AS stage;

  workspace_id := new_workspace_id;
  RETURN NEXT;
END
$function$;

RESET ROLE;

REVOKE CREATE ON SCHEMA private FROM marctco_provisioner;
