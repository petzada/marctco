-- `SET LOCAL` is reset to an empty setting when a pooled connection returns
-- to the session. Treat that empty value exactly like an absent GUC: no row
-- is visible, rather than allowing the UUID cast inside the RLS policy to
-- turn an unscoped read into a database error.
SET ROLE marctco_migrator;

DROP POLICY workspaces_workspace_isolation ON workspaces;
CREATE POLICY workspaces_workspace_isolation ON workspaces
  FOR ALL TO marctco_app, marctco_worker
  USING (id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

DROP POLICY workspace_members_workspace_isolation ON workspace_members;
CREATE POLICY workspace_members_workspace_isolation ON workspace_members
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

RESET ROLE;
