-- The only pre-GUC read in the application: resolve an authenticated user's
-- WorkspaceMember records by URL slug. The function is deliberately narrow:
-- it returns no business data and runs under a NOLOGIN role that remains
-- subject to RLS.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marctco_private_definer') THEN
    CREATE ROLE marctco_private_definer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

GRANT marctco_private_definer TO marctco_migrator WITH INHERIT FALSE, SET TRUE;
-- PostgreSQL requires CREATE on the containing schema while ownership is
-- transferred. It is revoked immediately after the function is owned.
GRANT USAGE, CREATE ON SCHEMA private TO marctco_private_definer;
GRANT USAGE ON SCHEMA private TO marctco_app;
GRANT SELECT ON TABLE workspaces, workspace_members TO marctco_private_definer;

SET ROLE marctco_migrator;

CREATE POLICY workspaces_private_definer_select ON workspaces
  FOR SELECT TO marctco_private_definer
  USING (true);

CREATE POLICY workspace_members_private_definer_select ON workspace_members
  FOR SELECT TO marctco_private_definer
  USING (true);

CREATE FUNCTION private.resolve_user_workspaces(
  authenticated_user_id UUID,
  requested_slug UUID DEFAULT NULL
)
RETURNS TABLE(
  workspace_id UUID,
  workspace_slug UUID,
  workspace_name TEXT,
  workspace_role public.workspace_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    member.workspace_id,
    workspace.slug,
    workspace.name,
    member.role
  FROM public.workspace_members AS member
  INNER JOIN public.workspaces AS workspace
    ON workspace.id = member.workspace_id
  WHERE member.user_id = authenticated_user_id
    AND (requested_slug IS NULL OR workspace.slug = requested_slug)
  ORDER BY workspace.name, workspace.id
$function$;

ALTER FUNCTION private.resolve_user_workspaces(UUID, UUID) OWNER TO marctco_private_definer;

RESET ROLE;

REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;
REVOKE ALL ON FUNCTION private.resolve_user_workspaces(UUID, UUID) FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.resolve_user_workspaces(UUID, UUID) TO marctco_app;
