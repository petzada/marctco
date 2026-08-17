-- Ticket 02: optional workspace clocks. Absence of a row is the domain
-- default, never SLA off. provision_workspace is not touched; the row is
-- born on the first write from Configurações. first_contact_trigger stays
-- out — it configures nothing until Fase 4 ships the dispatch.
SET ROLE marctco_migrator;

CREATE TABLE workspace_settings (
  workspace_id UUID NOT NULL,
  first_contact_sla_minutes INTEGER,
  stagnation_days INTEGER,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT workspace_settings_pkey PRIMARY KEY (workspace_id),
  CONSTRAINT workspace_settings_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT workspace_settings_first_contact_sla_minutes_positive
    CHECK (first_contact_sla_minutes IS NULL OR first_contact_sla_minutes > 0),
  CONSTRAINT workspace_settings_stagnation_days_positive
    CHECK (stagnation_days IS NULL OR stagnation_days > 0)
);

-- The primary key is workspace_id, which is also the index that serves the
-- RLS predicate and the tenant read.
ALTER TABLE workspace_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE workspace_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY workspace_settings_workspace_isolation ON workspace_settings
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

RESET ROLE;
