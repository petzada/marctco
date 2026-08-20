-- Ticket 01 — first-contact trigger/template on workspace_settings and
-- WhatsApp opt-in evidence/snapshot. Expand/contract: new columns are
-- nullable so existing rows keep domain defaults on read. RLS on
-- workspace_settings already covers the new columns.
SET ROLE marctco_migrator;

CREATE TYPE first_contact_trigger AS ENUM ('ON_ASSIGNMENT', 'ON_ARRIVAL', 'DISABLED');

ALTER TABLE workspace_settings
  ADD COLUMN first_contact_trigger first_contact_trigger,
  ADD COLUMN first_contact_template_body TEXT;

ALTER TABLE lead_submissions
  ADD COLUMN whatsapp_opt_in BOOLEAN;

ALTER TABLE opportunities
  ADD COLUMN whatsapp_opt_in BOOLEAN;

GRANT USAGE ON TYPE first_contact_trigger TO marctco_app, marctco_worker;

RESET ROLE;
