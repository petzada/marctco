-- A stage trigger validates only transactions that touch a Stage row. Without
-- this companion deferred trigger, a non-default or legal Pipeline can commit
-- empty even though every usable pipeline needs one ENTRY and one CLOSING.
-- The function permits nested pipeline+stage creation in one transaction,
-- but rejects the empty pipeline at commit.
SET ROLE marctco_migrator;

CREATE FUNCTION private.assert_pipeline_has_required_stages()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $function$
DECLARE
  entry_count INTEGER;
  closing_count INTEGER;
BEGIN
  SELECT
    COUNT(*) FILTER (WHERE role = 'ENTRY'),
    COUNT(*) FILTER (WHERE role = 'CLOSING')
  INTO entry_count, closing_count
  FROM public.stages
  WHERE pipeline_id = NEW.id AND workspace_id = NEW.workspace_id;

  IF entry_count <> 1 THEN
    RAISE EXCEPTION 'pipeline % must have exactly one ENTRY stage', NEW.id;
  END IF;
  IF closing_count < 1 THEN
    RAISE EXCEPTION 'pipeline % must have at least one CLOSING stage', NEW.id;
  END IF;

  RETURN NULL;
END
$function$;

CREATE CONSTRAINT TRIGGER pipelines_require_entry_and_closing
AFTER INSERT OR UPDATE ON pipelines
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW
EXECUTE FUNCTION private.assert_pipeline_has_required_stages();

REVOKE ALL ON FUNCTION private.assert_pipeline_has_required_stages() FROM PUBLIC;

RESET ROLE;
