-- The schema owner grants this briefly before migrations switch to the
-- restricted migrator role; only the owner can delegate CREATE here.
GRANT CREATE ON SCHEMA private TO marctco_private_definer;

SET ROLE marctco_migrator;

CREATE TYPE integration_provider AS ENUM ('PLUGA', 'LANDING_PAGE');
CREATE TYPE integration_connection_status AS ENUM ('ACTIVE', 'DISABLED');

CREATE TABLE integration_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  provider integration_provider NOT NULL,
  contract_version TEXT NOT NULL DEFAULT 'v1',
  token_hash CHAR(64) NOT NULL,
  token_last4 CHAR(4) NOT NULL,
  status integration_connection_status NOT NULL DEFAULT 'ACTIVE',
  target_pipeline_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT integration_connections_pkey PRIMARY KEY (id),
  CONSTRAINT integration_connections_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT integration_connections_workspace_id_target_pipeline_id_fkey
    FOREIGN KEY (workspace_id, target_pipeline_id)
    REFERENCES pipelines(workspace_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT integration_connections_workspace_id_provider_key UNIQUE (workspace_id, provider),
  CONSTRAINT integration_connections_token_hash_key UNIQUE (token_hash),
  CONSTRAINT integration_connections_contract_version_not_blank
    CHECK (btrim(contract_version) <> ''),
  CONSTRAINT integration_connections_token_hash_sha256_hex
    CHECK (token_hash ~ '^[0-9a-f]{64}$'),
  CONSTRAINT integration_connections_token_last4_length
    CHECK (char_length(token_last4) = 4)
);

CREATE INDEX integration_connections_workspace_id_idx ON integration_connections(workspace_id);

ALTER TABLE integration_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_connections_workspace_isolation ON integration_connections
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE integration_provider, integration_connection_status TO marctco_app, marctco_worker;
GRANT DELETE ON TABLE integration_connections TO marctco_app;

CREATE FUNCTION private.assert_integration_connection_target_pipeline()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.target_pipeline_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.pipelines AS pipeline
    WHERE pipeline.id = NEW.target_pipeline_id
      AND pipeline.workspace_id = NEW.workspace_id
      AND pipeline.type = 'COMMERCIAL'
  ) THEN
    RAISE EXCEPTION 'integration connection target pipeline must be commercial and belong to its workspace';
  END IF;

  RETURN NEW;
END
$function$;

CREATE TRIGGER integration_connections_require_commercial_target_pipeline
BEFORE INSERT OR UPDATE OF workspace_id, target_pipeline_id ON integration_connections
FOR EACH ROW
EXECUTE FUNCTION private.assert_integration_connection_target_pipeline();

-- The pre-context resolver needs these two relations only. Its executor is
-- still subject to FORCE RLS and receives a narrow SELECT policy for each.
GRANT SELECT ON TABLE integration_connections, pipelines TO marctco_private_definer;
CREATE POLICY integration_connections_private_definer_select ON integration_connections
  FOR SELECT TO marctco_private_definer
  USING (true);
CREATE POLICY pipelines_private_definer_select ON pipelines
  FOR SELECT TO marctco_private_definer
  USING (true);

CREATE FUNCTION private.resolve_workspace_by_token_hash(request_token_hash TEXT)
RETURNS TABLE(
  integration_connection_id UUID,
  workspace_id UUID,
  provider public.integration_provider,
  contract_version TEXT,
  pipeline_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    connection.id,
    connection.workspace_id,
    connection.provider,
    connection.contract_version,
    COALESCE(connection.target_pipeline_id, default_pipeline.id) AS pipeline_id
  FROM public.integration_connections AS connection
  LEFT JOIN public.pipelines AS default_pipeline
    ON default_pipeline.workspace_id = connection.workspace_id
   AND default_pipeline.type = 'COMMERCIAL'
   AND default_pipeline.is_default
  WHERE connection.token_hash = request_token_hash
    AND connection.status = 'ACTIVE'
    AND COALESCE(connection.target_pipeline_id, default_pipeline.id) IS NOT NULL
$function$;

ALTER FUNCTION private.resolve_workspace_by_token_hash(TEXT) OWNER TO marctco_private_definer;
REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;
REVOKE ALL ON FUNCTION private.assert_integration_connection_target_pipeline() FROM PUBLIC;

RESET ROLE;

REVOKE ALL ON FUNCTION private.resolve_workspace_by_token_hash(TEXT) FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.resolve_workspace_by_token_hash(TEXT) TO marctco_app;
