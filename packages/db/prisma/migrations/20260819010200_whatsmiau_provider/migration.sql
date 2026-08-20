-- Ticket 02 — Canal. Own transaction so the new enum value is committed
-- before the next migration uses it in CHECKs and a partial unique index.
-- PostgreSQL refuses to use a just-added enum value inside the same
-- transaction that added it.
SET ROLE marctco_migrator;

ALTER TYPE integration_provider ADD VALUE 'WHATSMIAU';

RESET ROLE;
