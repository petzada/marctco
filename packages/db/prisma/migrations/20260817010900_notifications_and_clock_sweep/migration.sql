-- Ticket 09 — Notification model, sixth private function, opportunity-clock
-- sweep discovery. Additive. Does not touch private.provision_workspace.
SET ROLE marctco_migrator;

CREATE TYPE notification_type AS ENUM ('FIRST_CONTACT_SLA_BREACHED', 'STAGNANT');

CREATE TABLE notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  type notification_type NOT NULL,
  detected_at TIMESTAMPTZ(6) NOT NULL,
  last_detected_at TIMESTAMPTZ(6) NOT NULL,
  read_at TIMESTAMPTZ(6),
  read_by_user_id UUID,
  resolved_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT notifications_pkey PRIMARY KEY (id),
  CONSTRAINT notifications_workspace_id_opportunity_id_type_key
    UNIQUE (workspace_id, opportunity_id, type),
  CONSTRAINT notifications_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT notifications_workspace_id_opportunity_id_fkey
    FOREIGN KEY (workspace_id, opportunity_id)
    REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT notifications_workspace_id_read_by_user_id_fkey
    FOREIGN KEY (workspace_id, read_by_user_id)
    REFERENCES workspace_members(workspace_id, user_id) ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT notifications_read_is_complete CHECK (
    (read_at IS NULL AND read_by_user_id IS NULL)
    OR (read_at IS NOT NULL AND read_by_user_id IS NOT NULL)
  )
);

-- Tenant-leading index the Seam 3 scan requires of every business table.
-- The UNIQUE (workspace_id, opportunity_id, type) is what makes the sweep
-- idempotent; the partial index is the question the dashboard asks.
CREATE INDEX notifications_workspace_id_idx ON notifications (workspace_id);
CREATE INDEX notifications_workspace_id_detected_at_unresolved_idx
  ON notifications (workspace_id, detected_at DESC)
  WHERE resolved_at IS NULL;

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications FORCE ROW LEVEL SECURITY;
CREATE POLICY notifications_workspace_isolation ON notifications
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE notification_type TO marctco_app, marctco_worker;

-- Column grants, not table grants: the executor answers "which tenants have
-- an overdue clock or an unresolved notification" and must not read Pessoa,
-- contacts or IntegrationEvent.raw (ADR-0019). 120 minutes / 7 days are the
-- domain defaults in packages/domain workspace-settings — absence of a
-- settings row means those values, never SLA off.
GRANT SELECT (
  workspace_id,
  arrived_at,
  first_contact_at,
  last_movement_at,
  status,
  merged_into_opportunity_id
) ON TABLE opportunities TO marctco_private_definer;
CREATE POLICY opportunities_private_definer_select ON opportunities
  FOR SELECT TO marctco_private_definer
  USING (true);

GRANT SELECT (
  workspace_id,
  first_contact_sla_minutes,
  stagnation_days
) ON TABLE workspace_settings TO marctco_private_definer;
CREATE POLICY workspace_settings_private_definer_select ON workspace_settings
  FOR SELECT TO marctco_private_definer
  USING (true);

GRANT SELECT (workspace_id, resolved_at)
  ON TABLE notifications TO marctco_private_definer;
CREATE POLICY notifications_private_definer_select ON notifications
  FOR SELECT TO marctco_private_definer
  USING (true);

GRANT USAGE ON TYPE opportunity_status TO marctco_private_definer;

RESET ROLE;

DO $schema_grants$
BEGIN
  IF NOT has_schema_privilege('marctco_private_definer', 'private', 'CREATE') THEN
    GRANT CREATE ON SCHEMA private TO marctco_private_definer;
  END IF;
END
$schema_grants$;

SET ROLE marctco_migrator;

-- Sixth private function. Discovery without a tenant: setting the GUC needs
-- the workspace_id only this read reveals (ADR-0019). Returns only
-- workspace_id — never opportunity_id, Pessoa, contact, raw, or an event
-- anchor. UNION of currently overdue OPEN unmerged clocks and unresolved
-- notifications so the next pass can resolve a cause that just ended.
CREATE FUNCTION private.claim_overdue_opportunity_workspaces(observed_at TIMESTAMPTZ)
RETURNS TABLE(workspace_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT DISTINCT opportunity.workspace_id
  FROM public.opportunities AS opportunity
  LEFT JOIN public.workspace_settings AS settings
    ON settings.workspace_id = opportunity.workspace_id
  WHERE opportunity.status = 'OPEN'::public.opportunity_status
    AND opportunity.merged_into_opportunity_id IS NULL
    AND (
      (
        opportunity.first_contact_at IS NULL
        AND opportunity.arrived_at
          <= observed_at
            - (COALESCE(settings.first_contact_sla_minutes, 120) * INTERVAL '1 minute')
      )
      OR (
        COALESCE(opportunity.last_movement_at, opportunity.arrived_at)
          <= observed_at
            - (COALESCE(settings.stagnation_days, 7) * INTERVAL '1 day')
      )
    )
  UNION
  SELECT DISTINCT notification.workspace_id
  FROM public.notifications AS notification
  WHERE notification.resolved_at IS NULL
$function$;

ALTER FUNCTION private.claim_overdue_opportunity_workspaces(TIMESTAMPTZ)
  OWNER TO marctco_private_definer;

REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;

RESET ROLE;

REVOKE ALL ON FUNCTION private.claim_overdue_opportunity_workspaces(TIMESTAMPTZ)
  FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.claim_overdue_opportunity_workspaces(TIMESTAMPTZ)
  TO marctco_app;
