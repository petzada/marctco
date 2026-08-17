-- Ticket 03a: the Equipe catalog later tickets compute a team from.
-- WorkspaceMember gains the status of the association and the denormalized
-- display fields; Tag / MemberTag are the catalog and its application.
-- Tag on Opportunity stays out of this phase (ADR-0020). Mapping is already
-- in ADR-0005; this migration materializes it.
SET ROLE marctco_migrator;

CREATE TYPE workspace_member_status AS ENUM ('ACTIVE', 'DETACHED');

ALTER TABLE workspace_members
  ADD COLUMN status workspace_member_status NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN display_name TEXT,
  ADD COLUMN email TEXT,
  ADD COLUMN whatsapp_phone_e164 TEXT;

CREATE TABLE tags (
  id UUID NOT NULL DEFAULT gen_random_uuid(),
  workspace_id UUID NOT NULL,
  name TEXT NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT tags_pkey PRIMARY KEY (id),
  CONSTRAINT tags_workspace_id_id_key UNIQUE (workspace_id, id),
  CONSTRAINT tags_name_not_blank CHECK (btrim(name) <> ''),
  CONSTRAINT tags_workspace_id_fkey
    FOREIGN KEY (workspace_id) REFERENCES workspaces(id) ON DELETE CASCADE ON UPDATE CASCADE
);

-- Uniqueness is by workspace and name without regard to case (ADR-0005).
-- Prisma cannot express an expression unique index, so it lives only here.
CREATE UNIQUE INDEX tags_workspace_id_lower_name_key
  ON tags (workspace_id, lower(name));
CREATE INDEX tags_workspace_id_idx ON tags (workspace_id);

CREATE TABLE member_tags (
  workspace_id UUID NOT NULL,
  user_id UUID NOT NULL,
  tag_id UUID NOT NULL,
  created_at TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT member_tags_pkey PRIMARY KEY (workspace_id, user_id, tag_id),
  CONSTRAINT member_tags_workspace_id_user_id_fkey
    FOREIGN KEY (workspace_id, user_id)
    REFERENCES workspace_members(workspace_id, user_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT member_tags_workspace_id_tag_id_fkey
    FOREIGN KEY (workspace_id, tag_id)
    REFERENCES tags(workspace_id, id)
    ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX member_tags_workspace_id_tag_id_idx ON member_tags (workspace_id, tag_id);

ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags FORCE ROW LEVEL SECURITY;
CREATE POLICY tags_workspace_isolation ON tags
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

ALTER TABLE member_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE member_tags FORCE ROW LEVEL SECURITY;
CREATE POLICY member_tags_workspace_isolation ON member_tags
  FOR ALL TO marctco_app, marctco_worker
  USING (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid)
  WITH CHECK (workspace_id = (SELECT NULLIF(current_setting('app.workspace_id', true), ''))::uuid);

GRANT USAGE ON TYPE workspace_member_status TO marctco_app, marctco_worker, marctco_private_definer;
-- Replacing a member's tags deletes the previous applications; the catalog
-- itself is not deleted in this ticket.
GRANT DELETE ON TABLE member_tags TO marctco_app;

-- The fourth private function gains the ACTIVE filter; a sixth function
-- does not appear (ADR-0019, ADR-0023). CREATE OR REPLACE must run as the
-- current owner — marctco_migrator cannot replace a function it does not own.
GRANT USAGE, CREATE ON SCHEMA private TO marctco_private_definer;
SET ROLE marctco_private_definer;

CREATE OR REPLACE FUNCTION private.resolve_user_workspaces(
  authenticated_user_id UUID,
  requested_slug UUID DEFAULT NULL
)
RETURNS TABLE(
  workspace_id UUID,
  workspace_slug UUID,
  workspace_name TEXT,
  workspace_role public.workspace_role
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $function$
  SELECT
    member.workspace_id,
    workspace.slug,
    workspace.name,
    member.role
  FROM public.workspace_members AS member
  INNER JOIN public.workspaces AS workspace
    ON workspace.id = member.workspace_id
  WHERE member.user_id = authenticated_user_id
    AND member.status = 'ACTIVE'::public.workspace_member_status
    AND (requested_slug IS NULL OR workspace.slug = requested_slug)
  ORDER BY workspace.name, workspace.id
$function$;

RESET ROLE;
SET ROLE marctco_migrator;
REVOKE CREATE ON SCHEMA private FROM marctco_private_definer;

RESET ROLE;

-- The OWNER already in production never passed through Equipe cadastro.
-- Fill display_name/email from auth.users in the same migration that adds
-- the columns. The migration session reads Auth into a temporary
-- table; the table owner then updates through a temporary RLS policy. This
-- keeps auth.users out of marctco_migrator's permanent privilege surface.
--
-- Three states have to be told apart, and only one of them is a backfill:
--
--   * `auth` absent            — the ephemeral Postgres of CI. Skip, silently.
--   * `auth` present, unreadable — Supabase. The `RESET ROLE` above returns to
--     the connection role, which is `marctco_migrator` (ADR-0010 §emenda de
--     2026-08-05), and that role has no USAGE on `auth`. Skip, loudly.
--   * `auth` present, readable  — backfill.
--
-- The guard cannot be one expression. `to_regclass` resolves the schema
-- through `LookupExplicitNamespace` and therefore *raises* 42501 when the
-- schema exists but is forbidden — which is why the first version of this
-- block, written to defend only against "auth absent", took production's
-- release pipeline down on 2026-08-14 and kept every later deploy from
-- shipping. `has_schema_privilege` raises in the mirror-image case, when the
-- schema is absent. And PostgreSQL does not promise to short-circuit `AND`,
-- so combining them into one condition would only move the raise around.
-- Nested IFs are what actually sequence the three questions.
DO $backfill$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_namespace WHERE nspname = 'auth') THEN
    RETURN;
  END IF;

  IF NOT has_schema_privilege(current_user, 'auth', 'USAGE') THEN
    RAISE WARNING
      'workspace_members backfill skipped: % has no USAGE on schema auth. The migration applies; display_name/email stay null for members created before Equipe. To fill them, run as postgres: GRANT USAGE ON SCHEMA auth TO %; GRANT SELECT ON TABLE auth.users TO %;',
      current_user, current_user, current_user;
    RETURN;
  END IF;

  IF to_regclass('auth.users') IS NULL THEN
    RETURN;
  END IF;

  IF NOT has_table_privilege(current_user, 'auth.users', 'SELECT') THEN
    RAISE WARNING
      'workspace_members backfill skipped: % cannot SELECT auth.users. To fill display_name/email, run as postgres: GRANT SELECT ON TABLE auth.users TO %;',
      current_user, current_user;
    RETURN;
  END IF;

  CREATE TEMPORARY TABLE workspace_member_auth_backfill AS
    SELECT
      auth_user.id AS user_id,
      COALESCE(
        NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
        NULLIF(btrim(auth_user.email), '')
      ) AS display_name,
      NULLIF(lower(btrim(auth_user.email)), '') AS email
    FROM auth.users AS auth_user;

  GRANT SELECT ON TABLE workspace_member_auth_backfill TO marctco_migrator;
END
$backfill$;

SET ROLE marctco_migrator;

DO $backfill$
BEGIN
  IF to_regclass('pg_temp.workspace_member_auth_backfill') IS NOT NULL THEN
    CREATE POLICY workspace_members_migration_backfill ON workspace_members
      FOR UPDATE TO marctco_migrator
      USING (true)
      WITH CHECK (true);

    UPDATE public.workspace_members AS member
    SET
      display_name = COALESCE(auth_user.display_name, member.display_name),
      email = COALESCE(auth_user.email, member.email)
    FROM pg_temp.workspace_member_auth_backfill AS auth_user
    WHERE auth_user.user_id = member.user_id;

    DROP POLICY workspace_members_migration_backfill ON workspace_members;
  END IF;
END
$backfill$;

RESET ROLE;
