-- Ticket 02 — Canal. Pairing columns, instanceName uniqueness, and the
-- WhatsMiau-only partial unique. Does not drop
-- integration_connections_workspace_id_provider_key (ADR-0031).
SET ROLE marctco_migrator;

CREATE TYPE whatsapp_pairing_state AS ENUM (
  'DISCONNECTED',
  'CONNECTING',
  'QR_PENDING',
  'CONNECTED',
  'SUSPENDED',
  'ERROR'
);

ALTER TABLE integration_connections
  ADD COLUMN instance_name TEXT,
  ADD COLUMN pairing_state whatsapp_pairing_state;

ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_instance_name_key UNIQUE (instance_name);

ALTER TABLE integration_connections
  ADD CONSTRAINT integration_connections_whatsmiau_instance_and_pairing CHECK (
    (
      provider = 'WHATSMIAU'
      AND instance_name IS NOT NULL
      AND btrim(instance_name) <> ''
      AND pairing_state IS NOT NULL
    )
    OR (
      provider <> 'WHATSMIAU'
      AND instance_name IS NULL
      AND pairing_state IS NULL
    )
  );

-- ADR-0003 / ADR-0031: at most one live WhatsMiau connection per workspace.
-- Partial, so a future drop of UNIQUE(workspace_id, provider) does not
-- reopen a second live WhatsMiau row.
CREATE UNIQUE INDEX integration_connections_one_live_whatsmiau_per_workspace_idx
  ON integration_connections (workspace_id)
  WHERE provider = 'WHATSMIAU' AND status <> 'DISABLED';

GRANT USAGE ON TYPE whatsapp_pairing_state TO marctco_app, marctco_worker;

RESET ROLE;
