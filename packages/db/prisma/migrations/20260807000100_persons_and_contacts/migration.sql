-- Person, and the contacts that make a Person findable again.
--
-- The rule this schema exists to hold is ADR-0007 §Identidade: a Pessoa keeps
-- many phones and many e-mails, receiving a new contact never overwrites an
-- older one, and keys that point at different Pessoas create a new Pessoa
-- rather than fusing two. Everything below is shaped by that.
SET ROLE marctco_migrator;

CREATE TABLE persons (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT,
  -- Digits only, check digits verified in packages/domain before it is
  -- written. Deliberately NOT unique: under an identity conflict two rows may
  -- carry the same CPF until a human merges them, and a unique constraint here
  -- would turn "duplicate visible" into "lead rejected" — the one trade this
  -- design never makes (ADR-0007).
  -- `text` and not `char(11)`: bpchar blank-pads on read, and a lookup key
  -- that no longer equals itself outside the database is not a key.
  cpf TEXT,
  -- The tombstone of a non-destructive merge. It does exactly two things —
  -- take the row out of active views and preserve the trail — and never a
  -- third: it never redirects a read. Whatever hung off the absorbed row is
  -- repointed at the canonical one inside the merge transaction.
  merged_into_person_id UUID,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMPTZ(6) NOT NULL,
  CONSTRAINT persons_pkey PRIMARY KEY (id),
  -- The composite key every child row references, so a Pessoa can only ever be
  -- pointed at from inside its own workspace.
  CONSTRAINT persons_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT persons_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT persons_cpf_is_eleven_digits
    CHECK (cpf IS NULL OR cpf ~ '^[0-9]{11}$'),
  CONSTRAINT persons_merge_points_elsewhere
    CHECK (merged_into_person_id IS NULL OR merged_into_person_id <> id)
);

-- Added after the table exists so the self-reference resolves against the
-- unique constraint declared above.
--
-- NO ACTION rather than RESTRICT: a canonical Pessoa must not be deletable
-- while a tombstone still points at it — losing it would take the trail the
-- tombstone exists to preserve — but dropping a whole workspace deletes both
-- rows in one cascading statement, and RESTRICT is checked per row while NO
-- ACTION is checked at the end. RESTRICT would make the cascade fail against
-- itself.
ALTER TABLE persons
  ADD CONSTRAINT persons_workspace_id_merged_into_person_id_fkey
  FOREIGN KEY (workspace_id, merged_into_person_id)
  REFERENCES persons(workspace_id, id) ON DELETE NO ACTION ON UPDATE NO ACTION;

CREATE TABLE person_phones (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  person_id UUID NOT NULL,
  -- E.164, normalized by the domain with Brazil as the default country.
  phone_e164 TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT person_phones_pkey PRIMARY KEY (id),
  -- What makes "no earlier contact is overwritten" structural rather than
  -- careful: the write is an insert that does nothing on conflict, so a
  -- resubmission of a number the Pessoa already has changes no row at all.
  CONSTRAINT person_phones_person_id_phone_e164_key UNIQUE (person_id, phone_e164),
  CONSTRAINT person_phones_workspace_id_person_id_fkey
    FOREIGN KEY (workspace_id, person_id)
    REFERENCES persons(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT person_phones_phone_is_e164
    CHECK (phone_e164 ~ '^\+[1-9][0-9]{6,14}$')
);

CREATE TABLE person_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  person_id UUID NOT NULL,
  -- Lowercase, normalized by the domain.
  email TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT person_emails_pkey PRIMARY KEY (id),
  CONSTRAINT person_emails_person_id_email_key UNIQUE (person_id, email),
  CONSTRAINT person_emails_workspace_id_person_id_fkey
    FOREIGN KEY (workspace_id, person_id)
    REFERENCES persons(workspace_id, id) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT person_emails_email_is_lowercase
    CHECK (email = lower(email) AND email ~ '^[^[:space:]@]+@[^[:space:]@.]+(\.[^[:space:]@.]+)+$')
);

CREATE INDEX persons_workspace_id_idx ON persons(workspace_id);
-- The lookup plan's strongest key. Leading with workspace_id because the read
-- always runs under a tenant, and RLS has already narrowed it to one.
CREATE INDEX persons_workspace_id_cpf_idx ON persons(workspace_id, cpf);
CREATE INDEX persons_workspace_id_merged_into_person_id_idx
  ON persons(workspace_id, merged_into_person_id);

CREATE INDEX person_phones_workspace_id_idx ON person_phones(workspace_id);
-- The two indexes findPersonCandidates reads: by contact value to answer "who
-- owns this number", and by person to collect a Pessoa's contacts.
CREATE INDEX person_phones_workspace_id_phone_e164_idx
  ON person_phones(workspace_id, phone_e164);
CREATE INDEX person_phones_workspace_id_person_id_idx
  ON person_phones(workspace_id, person_id);

CREATE INDEX person_emails_workspace_id_idx ON person_emails(workspace_id);
CREATE INDEX person_emails_workspace_id_email_idx ON person_emails(workspace_id, email);
CREATE INDEX person_emails_workspace_id_person_id_idx
  ON person_emails(workspace_id, person_id);

ALTER TABLE persons ENABLE ROW LEVEL SECURITY;
ALTER TABLE persons FORCE ROW LEVEL SECURITY;
CREATE POLICY persons_workspace_isolation ON persons
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

ALTER TABLE person_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_phones FORCE ROW LEVEL SECURITY;
CREATE POLICY person_phones_workspace_isolation ON person_phones
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

ALTER TABLE person_emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE person_emails FORCE ROW LEVEL SECURITY;
CREATE POLICY person_emails_workspace_isolation ON person_emails
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

RESET ROLE;
