-- The third operation without a tenant context: a Workspace cannot be scoped
-- by `app.workspace_id` before it exists (ADR-0006 regra 9, ADR-0019). The
-- function creates the tenant, its OWNER membership, the default commercial
-- pipeline and that pipeline's stages in one transaction, so no window exists
-- in which a workspace has no destination for an incoming lead.
--
-- Its executor is a role of its own rather than marctco_private_definer: that
-- role owns the read-only token and membership resolvers, and giving it INSERT
-- on workspaces would widen two pre-tenant reads into write paths. ADR-0019
-- allows reuse only when Seam 3 can prove the same containment; here it cannot.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marctco_provisioner') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolcreaterole OR rolsuper)
    ) THEN
      RAISE EXCEPTION
        'role marctco_provisioner must exist before this migration; run in the Supabase SQL Editor as postgres: CREATE ROLE marctco_provisioner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;';
    END IF;
    CREATE ROLE marctco_provisioner NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

-- Owning a function in the private schema requires the migrator to be able to
-- SET ROLE into the owner. INHERIT stays FALSE: the migrator never acquires
-- the executor's policies by accident.
DO $grant_migrator$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_auth_members AS member
    INNER JOIN pg_roles AS role ON role.oid = member.roleid
    INNER JOIN pg_roles AS member_role ON member_role.oid = member.member
    WHERE role.rolname = 'marctco_provisioner'
      AND member_role.rolname = 'marctco_migrator'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolcreaterole OR rolsuper)
    ) THEN
      RAISE EXCEPTION
        'marctco_migrator must receive marctco_provisioner membership before this migration; run in the Supabase SQL Editor as postgres: GRANT marctco_provisioner TO marctco_migrator WITH INHERIT FALSE, SET TRUE;';
    END IF;
    GRANT marctco_provisioner TO marctco_migrator WITH INHERIT FALSE, SET TRUE;
  END IF;
END
$grant_migrator$;

-- PostgreSQL requires the incoming owner to hold CREATE on the containing
-- schema while ownership is transferred. It is revoked again below.
GRANT CREATE ON SCHEMA private TO marctco_provisioner;

SET ROLE marctco_migrator;

GRANT SELECT, INSERT ON TABLE workspaces, workspace_members, pipelines TO marctco_provisioner;
GRANT INSERT ON TABLE stages TO marctco_provisioner;
GRANT USAGE ON TYPE workspace_role, pipeline_type, stage_role TO marctco_provisioner;

-- Under FORCE ROW LEVEL SECURITY every command the function issues needs its
-- own policy. SELECT covers the membership lookup and the RETURNING clauses;
-- nothing here grants UPDATE or DELETE, so provisioning can only add rows.
CREATE POLICY workspaces_provisioner_select ON workspaces
  FOR SELECT TO marctco_provisioner
  USING (true);

CREATE POLICY workspaces_provisioner_insert ON workspaces
  FOR INSERT TO marctco_provisioner
  WITH CHECK (true);

CREATE POLICY workspace_members_provisioner_select ON workspace_members
  FOR SELECT TO marctco_provisioner
  USING (true);

CREATE POLICY workspace_members_provisioner_insert ON workspace_members
  FOR INSERT TO marctco_provisioner
  WITH CHECK (true);

CREATE POLICY pipelines_provisioner_select ON pipelines
  FOR SELECT TO marctco_provisioner
  USING (true);

CREATE POLICY pipelines_provisioner_insert ON pipelines
  FOR INSERT TO marctco_provisioner
  WITH CHECK (true);

CREATE POLICY stages_provisioner_insert ON stages
  FOR INSERT TO marctco_provisioner
  WITH CHECK (true);

-- The pipeline definition arrives as an argument, never as a list repeated in
-- SQL: packages/domain keeps the single copy that the development seed and
-- this function share (ticket 05, ADR-0009).
CREATE FUNCTION private.provision_workspace(
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

  -- Two clicks or two tabs reach here concurrently. Serializing by owner for
  -- the rest of the transaction makes the second caller read the first
  -- caller's membership instead of inserting a second tenant.
  PERFORM pg_advisory_xact_lock(hashtextextended(owner_user_id::text, 0));

  SELECT member.workspace_id
  INTO existing_workspace_id
  FROM public.workspace_members AS member
  WHERE member.user_id = owner_user_id
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

ALTER FUNCTION private.provision_workspace(UUID, TEXT, JSONB) OWNER TO marctco_provisioner;

RESET ROLE;

REVOKE CREATE ON SCHEMA private FROM marctco_provisioner;
REVOKE ALL ON FUNCTION private.provision_workspace(UUID, TEXT, JSONB) FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.provision_workspace(UUID, TEXT, JSONB) TO marctco_app;
