-- A row releases one paid-per-use capability for one workspace. The absence
-- of a row is deliberately OFF; defaults cannot spend money (ADR-0004).
SET ROLE marctco_migrator;

CREATE TABLE workspace_flags (
  workspace_id UUID NOT NULL,
  key TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT workspace_flags_pkey PRIMARY KEY (workspace_id, key),
  CONSTRAINT workspace_flags_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- The composite primary key leads with workspace_id, so it is also the index
-- for the RLS predicate, tenant reads and the workspace cascade.
ALTER TABLE workspace_flags ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_flags FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_flags_workspace_isolation ON workspace_flags
  FOR SELECT TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

-- Foundation defaults grant future tables SELECT/INSERT/UPDATE to both runtime
-- roles. Releases belong to marctco, not to a tenant or a worker, so narrow
-- this table back to read-only at the database boundary.
REVOKE INSERT, UPDATE ON TABLE workspace_flags FROM marctco_app, marctco_worker;

RESET ROLE;
