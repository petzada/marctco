-- Ticket 19 — ADR-0031: the connection enters the submission's idempotent key,
-- and a workspace holds N connections per provider.
--
-- Every landing page sends source = LANDING_PAGE, and a landing page may
-- declare its own external_lead_id. Two of them numbering independently both
-- send lead "1", and UNIQUE(workspace_id, source, external_lead_id) reads the
-- second as a resend of the first: the lead is swallowed with no card, no
-- error, no quarantine and no row in the queue (ADR-0007 Mecanismo 1, emended
-- by ADR-0031).
--
-- The key fix and N connections per provider cannot be separated: with
-- UNIQUE(workspace_id, provider) in place a workspace holds one landing-page
-- connection at most, so two landing pages necessarily share one token — and a
-- key that includes the connection would still read them as one origin.
--
-- RLS AND BACKFILL. Every business table carries FORCE ROW LEVEL SECURITY, and
-- the policies name marctco_app and marctco_worker only. This migration runs as
-- marctco_migrator, which no policy covers, so a plain UPDATE here matches zero
-- rows and reports success — while ALTER TABLE, which RLS does not govern, then
-- sees the rows that were never touched. The first attempt at this migration
-- failed in production exactly there: SET NOT NULL found nulls that the guard
-- below had just counted as zero. CI cannot reproduce it, because CI migrates
-- an empty database.
--
-- The fix is to drop FORCE for the length of the backfill: without it the table
-- owner (marctco_migrator, which created these tables) bypasses RLS. FORCE is
-- restored before the migration ends, and the whole file is one transaction, so
-- no other session ever observes the table without it.
SET ROLE marctco_migrator;

ALTER TABLE lead_submissions ADD COLUMN integration_connection_id UUID;

ALTER TABLE lead_submissions NO FORCE ROW LEVEL SECURITY;

UPDATE lead_submissions AS submission
SET integration_connection_id = event.integration_connection_id
FROM integration_events AS event
WHERE event.workspace_id = submission.workspace_id
  AND event.id = submission.last_integration_event_id
  AND submission.integration_connection_id IS NULL;

-- Every lead_submission reaches its connection through last_integration_event_id,
-- so no submission is orphaned. This proves it rather than assuming it, and
-- aborts the release instead of letting a row fall out of the key. It runs
-- while FORCE is off, which is what makes the count real.
DO $backfill$
DECLARE
  unreachable BIGINT;
BEGIN
  SELECT count(*) INTO unreachable
  FROM lead_submissions
  WHERE integration_connection_id IS NULL;

  IF unreachable > 0 THEN
    RAISE EXCEPTION
      'ADR-0031 backfill: % lead_submissions reach no integration connection through last_integration_event_id. Fix the data before the column enters the key.',
      unreachable;
  END IF;
END
$backfill$;

ALTER TABLE lead_submissions FORCE ROW LEVEL SECURITY;

ALTER TABLE lead_submissions
  ALTER COLUMN integration_connection_id SET NOT NULL;

ALTER TABLE lead_submissions
  ADD CONSTRAINT lead_submissions_workspace_id_connection_id_fkey
    FOREIGN KEY (workspace_id, integration_connection_id)
    REFERENCES integration_connections(workspace_id, id)
    ON DELETE RESTRICT ON UPDATE CASCADE;

-- The new arbiter of "have I already received this transmission". It still
-- leads with workspace_id, so a conflict stays intra-tenant and the constraint
-- never becomes an existence oracle across workspaces (ADR-0007).
ALTER TABLE lead_submissions
  ADD CONSTRAINT lead_submissions_workspace_id_connection_source_external_key
    UNIQUE (workspace_id, integration_connection_id, source, external_lead_id);

ALTER TABLE lead_submissions
  DROP CONSTRAINT lead_submissions_workspace_id_source_external_lead_id_key;

-- N connections per provider. The one-live-WhatsMiau rule is not weakened:
-- 20260819010300 already carries it as a partial unique index over
-- (workspace_id) WHERE provider = WHATSMIAU AND status <> DISABLED, written
-- for exactly this drop (ADR-0003 composed with ADR-0031).
ALTER TABLE integration_connections
  DROP CONSTRAINT integration_connections_workspace_id_provider_key;

-- The client names the connection ("LP institucional", "Pluga ACR"), because
-- with several per provider the provider stops identifying anything on screen.
-- Born nullable, backfilled from the provider that was until now the identity,
-- then made required — same RLS caveat as above.
ALTER TABLE integration_connections ADD COLUMN name TEXT;

ALTER TABLE integration_connections NO FORCE ROW LEVEL SECURITY;

UPDATE integration_connections
SET name = CASE provider
  WHEN 'PLUGA' THEN 'Pluga'
  WHEN 'LANDING_PAGE' THEN 'Landing page'
  WHEN 'WHATSMIAU' THEN 'WhatsApp'
END
WHERE name IS NULL;

DO $names$
DECLARE
  unnamed BIGINT;
BEGIN
  SELECT count(*) INTO unnamed
  FROM integration_connections
  WHERE name IS NULL;

  IF unnamed > 0 THEN
    RAISE EXCEPTION
      'ADR-0031 backfill: % integration_connections have a provider the name backfill does not cover.',
      unnamed;
  END IF;
END
$names$;

ALTER TABLE integration_connections FORCE ROW LEVEL SECURITY;

ALTER TABLE integration_connections
  ALTER COLUMN name SET NOT NULL,
  ADD CONSTRAINT integration_connections_name_is_present
    CHECK (length(btrim(name)) > 0);

-- Case-insensitive, so "LP ACR" and "lp acr" cannot both exist and leave the
-- operator guessing which one a lead came through.
CREATE UNIQUE INDEX integration_connections_workspace_id_lower_name_idx
  ON integration_connections (workspace_id, lower(name));

RESET ROLE;
