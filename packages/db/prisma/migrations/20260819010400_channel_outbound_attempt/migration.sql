-- Ticket 03a — Canal. Outbound attempt is the Postgres outbox. Seventh
-- private function claims pending publication and fails expired PROCESSING
-- leases, inserting WHATSAPP_OUTBOUND_FAILED in the same statement.
-- Additive; does not touch private.provision_workspace.
--
-- The claimer is a role of its own: marctco_private_definer is the read-only
-- pre-tenant executor, and giving it UPDATE would widen every existing
-- resolver into a write path (ADR-0019).

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'marctco_channel_claimer') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolcreaterole OR rolsuper)
    ) THEN
      RAISE EXCEPTION
        'role marctco_channel_claimer must exist before this migration; run in the Supabase SQL Editor as postgres: CREATE ROLE marctco_channel_claimer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;';
    END IF;
    CREATE ROLE marctco_channel_claimer NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
  END IF;
END
$roles$;

DO $grant_migrator$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_auth_members AS member
    INNER JOIN pg_roles AS role ON role.oid = member.roleid
    INNER JOIN pg_roles AS member_role ON member_role.oid = member.member
    WHERE role.rolname = 'marctco_channel_claimer'
      AND member_role.rolname = 'marctco_migrator'
  ) THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_roles WHERE rolname = current_user AND (rolcreaterole OR rolsuper)
    ) THEN
      RAISE EXCEPTION
        'marctco_migrator must receive marctco_channel_claimer membership before this migration; run in the Supabase SQL Editor as postgres: GRANT marctco_channel_claimer TO marctco_migrator WITH INHERIT FALSE, SET TRUE;';
    END IF;
    GRANT marctco_channel_claimer TO marctco_migrator WITH INHERIT FALSE, SET TRUE;
  END IF;
END
$grant_migrator$;

DO $schema_grants$
BEGIN
  IF NOT has_schema_privilege('marctco_channel_claimer', 'private', 'CREATE') THEN
    GRANT CREATE ON SCHEMA private TO marctco_channel_claimer;
  END IF;
END
$schema_grants$;

SET ROLE marctco_migrator;

CREATE TYPE channel_outbound_attempt_kind AS ENUM ('AUTO_FIRST_CONTACT');
CREATE TYPE channel_outbound_dispatch_status AS ENUM ('PENDING', 'DISPATCHED');
CREATE TYPE channel_outbound_delivery_status AS ENUM ('QUEUED', 'PROCESSING', 'SENT', 'FAILED');
CREATE TYPE channel_outbound_failure_reason AS ENUM (
  'INSTANCE_NOT_CONNECTED',
  'ATTENDANT_PHONE_MISSING',
  'KNOWN_REFUSAL',
  'UNCERTAIN_EXTERNAL'
);

CREATE TABLE channel_outbound_attempts (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  opportunity_id UUID NOT NULL,
  kind channel_outbound_attempt_kind NOT NULL DEFAULT 'AUTO_FIRST_CONTACT',
  dispatch_status channel_outbound_dispatch_status NOT NULL DEFAULT 'PENDING',
  delivery_status channel_outbound_delivery_status NOT NULL DEFAULT 'QUEUED',
  failure_reason channel_outbound_failure_reason,
  provider_message_id TEXT,
  dispatch_lease_until TIMESTAMPTZ(6),
  processing_lease_until TIMESTAMPTZ(6),
  dispatched_at TIMESTAMPTZ(6),
  sent_at TIMESTAMPTZ(6),
  failed_at TIMESTAMPTZ(6),
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT channel_outbound_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT channel_outbound_attempts_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT channel_outbound_attempts_workspace_id_opportunity_id_kind_key
    UNIQUE (workspace_id, opportunity_id, kind),
  CONSTRAINT channel_outbound_attempts_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT channel_outbound_attempts_workspace_id_opportunity_id_fkey
    FOREIGN KEY (workspace_id, opportunity_id)
    REFERENCES opportunities(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT channel_outbound_attempts_dispatch_timestamp CHECK (
    (dispatch_status = 'DISPATCHED'::channel_outbound_dispatch_status) = (dispatched_at IS NOT NULL)
  ),
  CONSTRAINT channel_outbound_attempts_delivery_audit CHECK (
    (
      delivery_status = 'QUEUED'::channel_outbound_delivery_status
      AND sent_at IS NULL
      AND failed_at IS NULL
      AND failure_reason IS NULL
      AND processing_lease_until IS NULL
      AND provider_message_id IS NULL
    )
    OR (
      delivery_status = 'PROCESSING'::channel_outbound_delivery_status
      AND dispatch_status = 'DISPATCHED'::channel_outbound_dispatch_status
      AND sent_at IS NULL
      AND failed_at IS NULL
      AND failure_reason IS NULL
      AND processing_lease_until IS NOT NULL
      AND provider_message_id IS NULL
    )
    OR (
      delivery_status = 'SENT'::channel_outbound_delivery_status
      AND dispatch_status = 'DISPATCHED'::channel_outbound_dispatch_status
      AND sent_at IS NOT NULL
      AND failed_at IS NULL
      AND failure_reason IS NULL
    )
    OR (
      delivery_status = 'FAILED'::channel_outbound_delivery_status
      AND dispatch_status = 'DISPATCHED'::channel_outbound_dispatch_status
      AND failed_at IS NOT NULL
      AND failure_reason IS NOT NULL
      AND sent_at IS NULL
      AND provider_message_id IS NULL
    )
  )
);

CREATE INDEX channel_outbound_attempts_workspace_id_idx
  ON channel_outbound_attempts (workspace_id);
CREATE INDEX channel_outbound_attempts_pending_dispatch_idx
  ON channel_outbound_attempts (created_at, id)
  WHERE dispatch_status = 'PENDING'::channel_outbound_dispatch_status
    AND delivery_status = 'QUEUED'::channel_outbound_delivery_status;
CREATE INDEX channel_outbound_attempts_processing_lease_idx
  ON channel_outbound_attempts (processing_lease_until)
  WHERE delivery_status = 'PROCESSING'::channel_outbound_delivery_status;

ALTER TABLE channel_outbound_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE channel_outbound_attempts FORCE ROW LEVEL SECURITY;
CREATE POLICY channel_outbound_attempts_workspace_isolation ON channel_outbound_attempts
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE
  channel_outbound_attempt_kind,
  channel_outbound_dispatch_status,
  channel_outbound_delivery_status,
  channel_outbound_failure_reason,
  opportunity_timeline_event_type
  TO marctco_app, marctco_worker, marctco_channel_claimer;

-- Column grants, not a table grant: the function answers only
-- (attempt_id, workspace_id). Opportunity_id is readable here so an
-- expired PROCESSING lease can insert WHATSAPP_OUTBOUND_FAILED in the
-- same statement; it never appears in the return (ADR-0019).
GRANT SELECT (
  id,
  workspace_id,
  opportunity_id,
  dispatch_status,
  delivery_status,
  dispatch_lease_until,
  processing_lease_until,
  created_at
) ON TABLE channel_outbound_attempts TO marctco_channel_claimer;
GRANT UPDATE (
  dispatch_lease_until,
  delivery_status,
  failure_reason,
  failed_at,
  processing_lease_until,
  updated_at
) ON TABLE channel_outbound_attempts TO marctco_channel_claimer;

CREATE POLICY channel_outbound_attempts_channel_claimer_select ON channel_outbound_attempts
  FOR SELECT TO marctco_channel_claimer
  USING (true);
CREATE POLICY channel_outbound_attempts_channel_claimer_update ON channel_outbound_attempts
  FOR UPDATE TO marctco_channel_claimer
  USING (true)
  WITH CHECK (true);

-- Insert-only: the claimer writes the failed-send fact when a PROCESSING
-- lease expires, and cannot read timeline rows, Person, contacts or raw.
GRANT INSERT ON TABLE opportunity_timeline_events TO marctco_channel_claimer;
CREATE POLICY opportunity_timeline_events_channel_claimer_insert ON opportunity_timeline_events
  FOR INSERT TO marctco_channel_claimer
  WITH CHECK (true);

RESET ROLE;

SET ROLE marctco_migrator;

CREATE FUNCTION private.claim_pending_channel_attempts(
  batch_size INTEGER,
  observed_at TIMESTAMPTZ
)
RETURNS TABLE(attempt_id UUID, workspace_id UUID)
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  WITH expired AS (
    UPDATE public.channel_outbound_attempts AS attempt
    SET
      delivery_status = 'FAILED'::public.channel_outbound_delivery_status,
      failure_reason = 'UNCERTAIN_EXTERNAL'::public.channel_outbound_failure_reason,
      failed_at = observed_at,
      processing_lease_until = NULL,
      updated_at = observed_at
    WHERE attempt.delivery_status = 'PROCESSING'::public.channel_outbound_delivery_status
      AND attempt.processing_lease_until < observed_at
    RETURNING attempt.workspace_id, attempt.opportunity_id
  ),
  logged AS (
    INSERT INTO public.opportunity_timeline_events (
      workspace_id,
      opportunity_id,
      type,
      lead_submission_id,
      integration_event_id,
      occurred_at
    )
    SELECT
      expired.workspace_id,
      expired.opportunity_id,
      'WHATSAPP_OUTBOUND_FAILED'::public.opportunity_timeline_event_type,
      NULL,
      NULL,
      observed_at
    FROM expired
  ),
  picked AS (
    SELECT candidate.id
    FROM public.channel_outbound_attempts AS candidate
    WHERE candidate.dispatch_status = 'PENDING'::public.channel_outbound_dispatch_status
      AND candidate.delivery_status = 'QUEUED'::public.channel_outbound_delivery_status
      AND (
        candidate.dispatch_lease_until IS NULL
        OR candidate.dispatch_lease_until < observed_at
      )
    ORDER BY candidate.created_at, candidate.id
    FOR UPDATE SKIP LOCKED
    LIMIT GREATEST(LEAST(batch_size, 500), 1)
  )
  UPDATE public.channel_outbound_attempts AS attempt
  SET
    dispatch_lease_until = observed_at + INTERVAL '2 minutes',
    updated_at = observed_at
  FROM picked
  WHERE attempt.id = picked.id
  RETURNING attempt.id AS attempt_id, attempt.workspace_id
$function$;

ALTER FUNCTION private.claim_pending_channel_attempts(INTEGER, TIMESTAMPTZ)
  OWNER TO marctco_channel_claimer;

REVOKE CREATE ON SCHEMA private FROM marctco_channel_claimer;

RESET ROLE;

REVOKE ALL ON FUNCTION private.claim_pending_channel_attempts(INTEGER, TIMESTAMPTZ)
  FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.claim_pending_channel_attempts(INTEGER, TIMESTAMPTZ)
  TO marctco_app;
