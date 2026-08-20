-- Ticket 05 — Canal. Inbound WhatsMiau webhook facts on the Opportunity
-- timeline: truncated preview, provider message id, and connection-scoped
-- dedupe. Additive; does not touch private.provision_workspace or add an
-- eighth SECURITY DEFINER function. Token resolution stays on
-- private.resolve_workspace_by_token_hash.
SET ROLE marctco_migrator;

ALTER TABLE "opportunity_timeline_events"
  ADD COLUMN "integration_connection_id" UUID,
  ADD COLUMN "external_message_id" TEXT,
  ADD COLUMN "message_preview" TEXT;

ALTER TABLE "opportunity_timeline_events"
  ADD CONSTRAINT "opportunity_timeline_events_workspace_id_integration_conne_fkey"
  FOREIGN KEY ("workspace_id", "integration_connection_id")
  REFERENCES "integration_connections" ("workspace_id", "id")
  ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "opportunity_timeline_events"
  ADD CONSTRAINT "opportunity_timeline_events_inbound_payload_check"
  CHECK (
    ("type" <> 'WHATSAPP_INBOUND_RECEIVED'::opportunity_timeline_event_type)
    OR (
      "integration_connection_id" IS NOT NULL
      AND "external_message_id" IS NOT NULL
      AND btrim("external_message_id") <> ''
      AND "message_preview" IS NOT NULL
      AND char_length("message_preview") <= 140
    )
  );

CREATE UNIQUE INDEX "opportunity_timeline_events_inbound_message_dedupe_idx"
  ON "opportunity_timeline_events" (
    "workspace_id",
    "integration_connection_id",
    "external_message_id"
  )
  WHERE "type" = 'WHATSAPP_INBOUND_RECEIVED'::opportunity_timeline_event_type;

CREATE INDEX "opportunity_timeline_events_workspace_id_integration_connec_idx"
  ON "opportunity_timeline_events" ("workspace_id", "integration_connection_id");

RESET ROLE;
