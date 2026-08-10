-- Ticket 12: the indexes the Leads screen reads through, and the missing half
-- of identity-conflict resolution that "resolve here, not in Integrações"
-- turned out to require. Every change is additive.
SET ROLE marctco_migrator;

-- The list itself: keyset by (arrived_at DESC, id DESC), never OFFSET, with
-- merged cards kept out of the index entirely (ADR-0013 §Índices).
CREATE INDEX opportunities_workspace_id_arrived_at_id_active_idx
  ON opportunities (workspace_id, arrived_at DESC, id DESC)
  WHERE merged_into_opportunity_id IS NULL;

-- The "sem telefone" marker: one partial index serves both the row filter and
-- the counter (ADR-0013, ADR-0018).
CREATE INDEX opportunities_missing_phone_active_idx
  ON opportunities (workspace_id)
  WHERE missing_phone = TRUE AND merged_into_opportunity_id IS NULL;

-- Identity-conflict reviews had no way to be marked resolved: the ticket 11
-- CHECK forces `resolution IS NULL` for every IDENTITY_CONFLICT row, because
-- that enum only spells the three possible-duplicate outcomes. "A resolução
-- acontece aqui" for identity conflict too (mesclar numa candidata, ou
-- confirmar pessoas distintas), so it needs its own resolution column rather
-- than overloading `possible_duplicate_resolution` with values that would
-- never apply to a POSSIBLE_DUPLICATE row.
CREATE TYPE identity_conflict_resolution AS ENUM ('MERGED', 'CONFIRMED_DISTINCT');

ALTER TABLE intake_reviews
  ADD COLUMN identity_conflict_resolution identity_conflict_resolution;

ALTER TABLE intake_reviews
  DROP CONSTRAINT intake_reviews_type_carries_its_own_evidence;

ALTER TABLE intake_reviews
  ADD CONSTRAINT intake_reviews_type_carries_its_own_evidence CHECK (
    (
      type = 'IDENTITY_CONFLICT'
      AND cardinality(candidate_person_ids) > 0
      AND related_opportunity_id IS NULL
      AND resolution IS NULL
    )
    OR (
      type = 'POSSIBLE_DUPLICATE'
      AND cardinality(candidate_person_ids) = 0
      AND identity_conflict_resolution IS NULL
      AND (
        related_opportunity_id IS NOT NULL
        OR resolution = 'SAME_FINANCING'
      )
    )
  );

ALTER TABLE intake_reviews
  DROP CONSTRAINT intake_reviews_resolution_audit_is_complete;

ALTER TABLE intake_reviews
  ADD CONSTRAINT intake_reviews_resolution_audit_is_complete CHECK (
    (
      resolution IS NULL
      AND identity_conflict_resolution IS NULL
      AND resolved_by_user_id IS NULL
      AND resolved_at IS NULL
      AND resolution_reason IS NULL
    )
    OR (
      (resolution IS NOT NULL OR identity_conflict_resolution IS NOT NULL)
      AND resolved_by_user_id IS NOT NULL
      AND resolved_at IS NOT NULL
      AND length(btrim(resolution_reason)) > 0
    )
  );

-- "Não resolvidas" now means neither resolution column is set. The single
-- marker icon reads unresolved reviews of both types through this index
-- (ADR-0013 §Índices: "os marcadores não moram todos no mesmo lugar").
DROP INDEX intake_reviews_workspace_id_opportunity_id_idx;
CREATE INDEX intake_reviews_workspace_id_opportunity_id_idx
  ON intake_reviews (workspace_id, opportunity_id)
  WHERE resolution IS NULL AND identity_conflict_resolution IS NULL;

-- One partial index per marker, serving the row filter and the counter
-- together (ADR-0013, ADR-0018): counting a subset is cheap, counting the
-- whole table is not.
CREATE INDEX intake_reviews_identity_conflict_pending_idx
  ON intake_reviews (workspace_id, opportunity_id)
  WHERE type = 'IDENTITY_CONFLICT'
    AND resolution IS NULL
    AND identity_conflict_resolution IS NULL;

CREATE INDEX intake_reviews_possible_duplicate_pending_idx
  ON intake_reviews (workspace_id, opportunity_id)
  WHERE type = 'POSSIBLE_DUPLICATE'
    AND resolution IS NULL;

GRANT USAGE ON TYPE identity_conflict_resolution TO marctco_app, marctco_worker;

RESET ROLE;
