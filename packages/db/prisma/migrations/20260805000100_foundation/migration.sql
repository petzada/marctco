-- Roles are part of the schema history so local, CI and production share one topology.
-- Passwords are intentionally absent and must be assigned with ALTER ROLE outside git.
DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marctco_migrator') THEN
    CREATE ROLE marctco_migrator LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marctco_app') THEN
    CREATE ROLE marctco_app LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marctco_worker') THEN
    CREATE ROLE marctco_worker LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

GRANT USAGE, CREATE ON SCHEMA public TO marctco_migrator;
GRANT USAGE ON SCHEMA public TO marctco_app, marctco_worker;
CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE, CREATE ON SCHEMA private TO marctco_migrator;

SET ROLE marctco_migrator;

CREATE TYPE workspace_role AS ENUM ('ATTENDANT', 'SUPERVISOR', 'MANAGER', 'OWNER');

CREATE TABLE workspaces (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  slug UUID NOT NULL DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT workspaces_pkey PRIMARY KEY (id)
);

CREATE TABLE workspace_members (
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  role workspace_role NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT workspace_members_pkey PRIMARY KEY (workspace_id, user_id),
  CONSTRAINT workspace_members_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX workspaces_slug_key ON workspaces(slug);
CREATE INDEX workspace_members_user_id_idx ON workspace_members(user_id);

ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspaces FORCE ROW LEVEL SECURITY;
CREATE POLICY workspaces_workspace_isolation ON workspaces
  FOR ALL TO marctco_app, marctco_worker
  USING (id = (SELECT current_setting('app.workspace_id', true))::uuid)
  WITH CHECK (id = (SELECT current_setting('app.workspace_id', true))::uuid);

ALTER TABLE workspace_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_members FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_members_workspace_isolation ON workspace_members
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT current_setting('app.workspace_id', true))::uuid)
  WITH CHECK (workspace_id = (SELECT current_setting('app.workspace_id', true))::uuid);

RESET ROLE;

GRANT USAGE ON TYPE workspace_role TO marctco_app, marctco_worker;
GRANT SELECT, INSERT, UPDATE ON TABLE workspaces, workspace_members TO marctco_app, marctco_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE marctco_migrator IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE ON TABLES TO marctco_app, marctco_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE marctco_migrator IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO marctco_app, marctco_worker;
