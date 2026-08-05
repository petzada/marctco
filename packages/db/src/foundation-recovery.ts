export const FOUNDATION_MIGRATION_NAME = "20260805000100_foundation";
export const AUTH_WORKSPACE_MIGRATION_NAME =
  "20260805000200_authentication_workspace_context";

const FOUNDATION_EXPECTED_FAILURE = 'permission denied to set role "marctco_migrator"';
const AUTH_WORKSPACE_CREATE_ROLE_FAILURE = "permission denied to create role";
const AUTH_WORKSPACE_GRANT_ROLE_FAILURE = "permission denied to grant role";

export const PRIVATE_DEFINER_ROLE = "marctco_private_definer";
export const PRIVATE_DEFINER_BOOTSTRAP_SQL = `CREATE ROLE ${PRIVATE_DEFINER_ROLE} NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;`;
export const PRIVATE_DEFINER_GRANT_SQL = `GRANT ${PRIVATE_DEFINER_ROLE} TO marctco_migrator WITH INHERIT FALSE, SET TRUE;`;

function isAuthWorkspaceExpectedFailure(logs: string | null | undefined): boolean {
  if (!logs) {
    return false;
  }
  return (
    logs.includes(AUTH_WORKSPACE_CREATE_ROLE_FAILURE) ||
    logs.includes(AUTH_WORKSPACE_GRANT_ROLE_FAILURE)
  );
}

function isAuthWorkspaceGrantRoleFailure(logs: string | null | undefined): boolean {
  return logs?.includes(AUTH_WORKSPACE_GRANT_ROLE_FAILURE) ?? false;
}

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

export interface AuthWorkspaceArtifacts {
  private_definer_role_exists: boolean;
  migrator_private_definer_membership: boolean;
  resolve_user_workspaces_exists: boolean;
  definer_policies: string[];
}

export interface FoundationRecoveryState {
  history_table_exists: boolean;
  migrations: FailedMigrationState[];
  artifacts: FoundationArtifacts;
}

export interface AuthWorkspaceRecoveryState {
  history_table_exists: boolean;
  migrations: FailedMigrationState[];
  artifacts: AuthWorkspaceArtifacts;
}

export type MigrationRecoveryDecision =
  | { action: "none"; reason: string }
  | { action: "resolve-rolled-back"; migration_name: string }
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
): MigrationRecoveryDecision {
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
  if (unresolved.length !== 1) {
    return { action: "abort", reason: "more than one unresolved migration exists" };
  }

  const failed = unresolved[0];
  if (!failed || failed.migration_name !== FOUNDATION_MIGRATION_NAME) {
    return { action: "none", reason: "the unresolved migration is not the foundation migration" };
  }
  if (artifactCount(state.artifacts) !== 0) {
    return { action: "abort", reason: "foundation artifacts exist beside failed history" };
  }
  if (!failed.logs?.includes(FOUNDATION_EXPECTED_FAILURE)) {
    return { action: "abort", reason: "the foundation migration failed for a different reason" };
  }
  return { action: "resolve-rolled-back", migration_name: FOUNDATION_MIGRATION_NAME };
}

export function decideAuthWorkspaceRecovery(
  state: AuthWorkspaceRecoveryState
): MigrationRecoveryDecision {
  if (!state.history_table_exists) {
    return { action: "none", reason: "migration history does not exist yet" };
  }

  const unresolved = state.migrations.filter(
    (migration) => migration.finished_at === null && migration.rolled_back_at === null
  );
  if (unresolved.length === 0) {
    return { action: "none", reason: "no unresolved failed migration" };
  }
  if (unresolved.length !== 1) {
    return { action: "abort", reason: "more than one unresolved migration exists" };
  }

  const failed = unresolved[0];
  if (!failed || failed.migration_name !== AUTH_WORKSPACE_MIGRATION_NAME) {
    return {
      action: "none",
      reason: "the unresolved migration is not the authentication workspace migration"
    };
  }
  if (!isAuthWorkspaceExpectedFailure(failed.logs)) {
    return {
      action: "abort",
      reason: "the authentication workspace migration failed for a different reason"
    };
  }

  const { artifacts } = state;
  if (artifacts.resolve_user_workspaces_exists) {
    return {
      action: "abort",
      reason: "private.resolve_user_workspaces already exists beside failed history"
    };
  }
  if (artifacts.definer_policies.length !== 0) {
    return {
      action: "abort",
      reason: "authentication workspace definer policies already exist beside failed history"
    };
  }
  if (!artifacts.private_definer_role_exists) {
    return {
      action: "abort",
      reason: `role ${PRIVATE_DEFINER_ROLE} must be created manually in Supabase SQL Editor as postgres before recovery; run: ${PRIVATE_DEFINER_BOOTSTRAP_SQL}`
    };
  }
  if (
    isAuthWorkspaceGrantRoleFailure(failed.logs) &&
    !artifacts.migrator_private_definer_membership
  ) {
    return {
      action: "abort",
      reason: `marctco_migrator must receive ${PRIVATE_DEFINER_ROLE} membership manually in Supabase SQL Editor as postgres before recovery; run: ${PRIVATE_DEFINER_GRANT_SQL}`
    };
  }

  return { action: "resolve-rolled-back", migration_name: AUTH_WORKSPACE_MIGRATION_NAME };
}

export function decideMigrationRecovery(
  foundationState: FoundationRecoveryState,
  authWorkspaceState: AuthWorkspaceRecoveryState
): MigrationRecoveryDecision {
  const foundationDecision = decideFoundationRecovery(foundationState);
  if (foundationDecision.action !== "none") {
    return foundationDecision;
  }
  return decideAuthWorkspaceRecovery(authWorkspaceState);
}
