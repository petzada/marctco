-- A target is valid not only when the IntegrationConnection is written: a
-- referenced Pipeline must not later be reclassified as LEGAL.
SET ROLE marctco_migrator;

CREATE FUNCTION private.assert_integration_target_pipelines_remain_commercial()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
BEGIN
  IF NEW.type = OLD.type OR NEW.type = 'COMMERCIAL' THEN
    RETURN NULL;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.integration_connections AS connection
    WHERE connection.workspace_id = NEW.workspace_id
      AND connection.target_pipeline_id = NEW.id
  ) THEN
    RAISE EXCEPTION 'a pipeline referenced by an integration connection must remain commercial';
  END IF;

  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER integration_target_pipelines_remain_commercial
AFTER UPDATE ON pipelines
DEFERRABLE INITIALLY IMMEDIATE
FOR EACH ROW
EXECUTE FUNCTION private.assert_integration_target_pipelines_remain_commercial();

REVOKE ALL ON FUNCTION private.assert_integration_target_pipelines_remain_commercial() FROM PUBLIC;

RESET ROLE;
