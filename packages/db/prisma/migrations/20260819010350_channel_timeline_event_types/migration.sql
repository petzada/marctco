-- Ticket 03a — commit channel timeline enum values before the outbound
-- attempt migration creates functions that use them. PostgreSQL rejects
-- using a newly-added enum value in the transaction that added it.
SET ROLE marctco_migrator;

ALTER TYPE opportunity_timeline_event_type ADD VALUE 'WHATSAPP_OUTBOUND_SENT';
ALTER TYPE opportunity_timeline_event_type ADD VALUE 'WHATSAPP_OUTBOUND_FAILED';
ALTER TYPE opportunity_timeline_event_type ADD VALUE 'WHATSAPP_INBOUND_RECEIVED';

RESET ROLE;
