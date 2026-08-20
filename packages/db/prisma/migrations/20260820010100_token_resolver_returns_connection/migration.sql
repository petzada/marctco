-- Ticket 05 — Canal. The existing pre-tenant resolver already answers
-- "which connection authenticated this hash?". Returning only workspace_id
-- forced inbound to fabricate JobOrigin.channel_inbound. Keep the same
-- name and the closed list of seven; widen the return to the two technical
-- ids, never provider, token, payload or PII.
-- ADR-0019 (emended 2026-08-20): CREATE OR REPLACE cannot change OUT
-- columns, so replace like 20260805000800.
SET ROLE marctco_private_definer;
DROP FUNCTION private.resolve_workspace_by_token_hash(TEXT);
RESET ROLE;

GRANT CREATE ON SCHEMA private TO marctco_private_definer;
SET ROLE marctco_migrator;

CREATE FUNCTION private.resolve_workspace_by_token_hash(request_token_hash TEXT)
RETURNS TABLE(
  workspace_id UUID,
  integration_connection_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    connection.workspace_id,
    connection.id AS integration_connection_id
  FROM public.integration_connections AS connection
  WHERE connection.token_hash = request_token_hash
    AND connection.status = 'ACTIVE'
$function$;

ALTER FUNCTION private.resolve_workspace_by_token_hash(TEXT) OWNER TO marctco_private_definer;
REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;

RESET ROLE;

REVOKE ALL ON FUNCTION private.resolve_workspace_by_token_hash(TEXT) FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.resolve_workspace_by_token_hash(TEXT) TO marctco_app;
