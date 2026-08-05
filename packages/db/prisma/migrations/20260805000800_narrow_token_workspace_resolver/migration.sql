-- ADR-0019 permits this pre-tenant function to return workspace_id only.
-- Version 007 was already applied locally with a broader shape, so replace it
-- in a follow-up migration rather than rewriting migration history.
SET ROLE marctco_private_definer;
DROP FUNCTION private.resolve_workspace_by_token_hash(TEXT);
RESET ROLE;

DROP POLICY IF EXISTS pipelines_private_definer_select ON pipelines;
REVOKE SELECT ON TABLE pipelines FROM marctco_private_definer;

GRANT CREATE ON SCHEMA private TO marctco_private_definer;
SET ROLE marctco_migrator;

CREATE FUNCTION private.resolve_workspace_by_token_hash(request_token_hash TEXT)
RETURNS TABLE(workspace_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT connection.workspace_id
  FROM public.integration_connections AS connection
  WHERE connection.token_hash = request_token_hash
    AND connection.status = 'ACTIVE'
$function$;

ALTER FUNCTION private.resolve_workspace_by_token_hash(TEXT) OWNER TO marctco_private_definer;
REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;

RESET ROLE;

REVOKE ALL ON FUNCTION private.resolve_workspace_by_token_hash(TEXT) FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.resolve_workspace_by_token_hash(TEXT) TO marctco_app;
