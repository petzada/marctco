-- The outbox. A lead is accepted by committing its raw payload here, before
-- the 200 and before anything interprets it (ADR-0007). The dispatcher reads
-- pending work from this table — never from Redis, which is operational state
-- and never the source of truth.
SET ROLE marctco_migrator;

CREATE TYPE integration_event_status AS ENUM ('RECEIVED', 'PROCESSED', 'QUARANTINED', 'FAILED');
CREATE TYPE integration_event_dispatch_status AS ENUM ('PENDING', 'DISPATCHED');

-- The composite key the event's foreign key needs, so a connection can only
-- ever be referenced from inside its own workspace.
ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_workspace_id_id_key UNIQUE (workspace_id, id);

CREATE TABLE integration_events (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  integration_connection_id UUID NOT NULL,
  -- Nullable, and null can only ever mean expired: the payload is written on
  -- receipt, before the 200, and the row outlives it (ADR-0014).
  raw JSONB,
  status integration_event_status NOT NULL DEFAULT 'RECEIVED',
  dispatch_status integration_event_dispatch_status NOT NULL DEFAULT 'PENDING',
  received_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  dispatched_at TIMESTAMPTZ(6),
  processed_at TIMESTAMPTZ(6),
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT integration_events_pkey PRIMARY KEY (id),
  CONSTRAINT integration_events_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT integration_events_workspace_id_integration_connection_id_fkey
    FOREIGN KEY (workspace_id, integration_connection_id)
    REFERENCES integration_connections(workspace_id, id) ON DELETE RESTRICT ON UPDATE CASCADE,
  -- A dispatched event knows when, and a processed one knows when. Recording
  -- the state without the instant would leave the Integrações screen unable to
  -- answer "since when" about the only thing it reports.
  CONSTRAINT integration_events_dispatched_at_matches_status
    CHECK ((dispatch_status = 'DISPATCHED') = (dispatched_at IS NOT NULL)),
  CONSTRAINT integration_events_processed_at_matches_status
    CHECK ((status = 'PROCESSED') = (processed_at IS NOT NULL))
);

CREATE INDEX integration_events_workspace_id_idx ON integration_events(workspace_id);
-- The dispatcher's only query: oldest pending first, across every workspace.
CREATE INDEX integration_events_dispatch_status_received_at_idx
  ON integration_events(dispatch_status, received_at);

ALTER TABLE integration_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE integration_events FORCE ROW LEVEL SECURITY;
CREATE POLICY integration_events_workspace_isolation ON integration_events
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE integration_event_status, integration_event_dispatch_status
  TO marctco_app, marctco_worker;

-- The dispatcher looks for pending work in every workspace, with no session and
-- no job yet: claiming per event is circular, because the claim needs the
-- workspace_id that only the read reveals (ADR-0006 regra 9). The executor is
-- the same read-only technical role that owns the other two resolvers — it
-- gains SELECT and nothing else, so all three stay incapable of writing.
GRANT SELECT ON TABLE integration_events TO marctco_private_definer;
CREATE POLICY integration_events_private_definer_select ON integration_events
  FOR SELECT TO marctco_private_definer
  USING (true);

RESET ROLE;

GRANT CREATE ON SCHEMA private TO marctco_private_definer;
SET ROLE marctco_migrator;

-- Returns (id, workspace_id) and nothing else. `raw` carries CPF and phone
-- numbers: a function without a tenant that returned payload would be a
-- cross-tenant leak wearing the face of a feature (ADR-0007).
CREATE FUNCTION private.claim_pending_events(batch_size INTEGER)
RETURNS TABLE(id UUID, workspace_id UUID)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT event.id, event.workspace_id
  FROM public.integration_events AS event
  WHERE event.dispatch_status = 'PENDING'
  ORDER BY event.received_at, event.id
  LIMIT GREATEST(LEAST(batch_size, 500), 1)
$function$;

ALTER FUNCTION private.claim_pending_events(INTEGER) OWNER TO marctco_private_definer;
REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;

RESET ROLE;

-- Publishing twice is tolerated — the jobId is derived from the event id — so
-- the dispatcher never needs to hold a lock across a network call. Marking the
-- event dispatched is a normal tenant-scoped write, once BullMQ has confirmed.
REVOKE ALL ON FUNCTION private.claim_pending_events(INTEGER) FROM PUBLIC, marctco_worker;
GRANT EXECUTE ON FUNCTION private.claim_pending_events(INTEGER) TO marctco_app;
