-- Activity on the lead (Fase 3 ticket 01). The keystone: every row is
-- bound to an Opportunity, DONE proves attendance and CANCELED does not,
-- and MESSAGE is a nature of work, not a channel.
SET ROLE marctco_migrator;

CREATE TYPE activity_type AS ENUM ('CALL', 'MESSAGE', 'MEETING', 'TASK');
CREATE TYPE activity_status AS ENUM ('OPEN', 'DONE', 'CANCELED');

CREATE TABLE activities (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  assigned_user_id UUID NOT NULL,
  type activity_type NOT NULL,
  title TEXT NOT NULL,
  notes TEXT,
  due_at TIMESTAMPTZ(6) NOT NULL,
  status activity_status NOT NULL DEFAULT 'OPEN',
  completed_at TIMESTAMPTZ(6),
  completed_by_user_id UUID,
  canceled_at TIMESTAMPTZ(6),
  created_by_user_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT activities_pkey PRIMARY KEY (id),
  CONSTRAINT activities_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT activities_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT activities_workspace_id_opportunity_id_fkey
    FOREIGN KEY (workspace_id, opportunity_id)
    REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT activities_workspace_id_assigned_user_id_fkey
    FOREIGN KEY (workspace_id, assigned_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT activities_workspace_id_created_by_user_id_fkey
    FOREIGN KEY (workspace_id, created_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT activities_workspace_id_completed_by_user_id_fkey
    FOREIGN KEY (workspace_id, completed_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT activities_title_is_present CHECK (length(btrim(title)) > 0),
  CONSTRAINT activities_status_matches_audit CHECK (
    (
      status = 'OPEN'::activity_status
      AND completed_at IS NULL
      AND completed_by_user_id IS NULL
      AND canceled_at IS NULL
    )
    OR (
      status = 'DONE'::activity_status
      AND completed_at IS NOT NULL
      AND completed_by_user_id IS NOT NULL
      AND canceled_at IS NULL
    )
    OR (
      status = 'CANCELED'::activity_status
      AND canceled_at IS NOT NULL
      AND completed_at IS NULL
      AND completed_by_user_id IS NULL
    )
  )
);

CREATE INDEX activities_workspace_id_due_at_id_idx
  ON activities (workspace_id, due_at, id);
CREATE INDEX activities_workspace_id_opportunity_id_due_at_idx
  ON activities (workspace_id, opportunity_id, due_at);
CREATE INDEX activities_workspace_id_assigned_user_id_due_at_open_idx
  ON activities (workspace_id, assigned_user_id, due_at)
  WHERE status = 'OPEN'::activity_status;

ALTER TABLE activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE activities FORCE ROW LEVEL SECURITY;
CREATE POLICY activities_workspace_isolation ON activities
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE activity_type, activity_status TO marctco_app, marctco_worker;

RESET ROLE;
