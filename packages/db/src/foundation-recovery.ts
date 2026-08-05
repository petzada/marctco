export const FOUNDATION_MIGRATION_NAME = "20260805000100_foundation";
const EXPECTED_FAILURE = 'permission denied to set role "marctco_migrator"';

export interface FailedMigrationState {
  migration_name: string;
  finished_at: Date | null;
  rolled_back_at: Date | null;
  logs: string | null;
}

export interface FoundationArtifacts {
  roles: string[];
  schemas: string[];
  types: string[];
  tables: string[];
}

export interface FoundationRecoveryState {
  history_table_exists: boolean;
  migrations: FailedMigrationState[];
  artifacts: FoundationArtifacts;
}

export type FoundationRecoveryDecision =
  | { action: "none"; reason: string }
  | { action: "resolve-rolled-back"; migration_name: typeof FOUNDATION_MIGRATION_NAME }
  | { action: "abort"; reason: string };

function artifactCount(artifacts: FoundationArtifacts): number {
  return (
    artifacts.roles.length +
    artifacts.schemas.length +
    artifacts.types.length +
    artifacts.tables.length
  );
}

export function decideFoundationRecovery(
  state: FoundationRecoveryState
): FoundationRecoveryDecision {
  if (!state.history_table_exists) {
    if (artifactCount(state.artifacts) !== 0) {
      return { action: "abort", reason: "foundation artifacts exist without migration history" };
    }
    return { action: "none", reason: "migration history does not exist yet" };
  }

  const unresolved = state.migrations.filter(
    (migration) => migration.finished_at === null && migration.rolled_back_at === null
  );
  if (unresolved.length === 0) {
    return { action: "none", reason: "no unresolved failed migration" };
  }
  if (artifactCount(state.artifacts) !== 0) {
    return { action: "abort", reason: "foundation artifacts exist beside failed history" };
  }
  if (unresolved.length !== 1) {
    return { action: "abort", reason: "more than one unresolved migration exists" };
  }

  const failed = unresolved[0];
  if (!failed || failed.migration_name !== FOUNDATION_MIGRATION_NAME) {
    return { action: "abort", reason: "the unresolved migration is not the foundation migration" };
  }
  if (!failed.logs?.includes(EXPECTED_FAILURE)) {
    return { action: "abort", reason: "the foundation migration failed for a different reason" };
  }
  return { action: "resolve-rolled-back", migration_name: FOUNDATION_MIGRATION_NAME };
}
