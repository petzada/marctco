import { describe, expect, it } from "vitest";
import {
  AUTH_WORKSPACE_MIGRATION_NAME,
  decideAuthWorkspaceRecovery,
  decideFoundationRecovery,
  decideMigrationRecovery,
  FOUNDATION_MIGRATION_NAME,
  PRIVATE_DEFINER_BOOTSTRAP_SQL,
  type AuthWorkspaceRecoveryState,
  type FoundationRecoveryState
} from "./foundation-recovery.js";

const pristineFoundationFailure: FoundationRecoveryState = {
  history_table_exists: true,
  migrations: [
    {
      migration_name: FOUNDATION_MIGRATION_NAME,
      finished_at: null,
      rolled_back_at: null,
      logs: 'ERROR: permission denied to set role "marctco_migrator"'
    }
  ],
  artifacts: { roles: [], schemas: [], types: [], tables: [] }
};

const pristineAuthFailure: AuthWorkspaceRecoveryState = {
  history_table_exists: true,
  migrations: [
    {
      migration_name: FOUNDATION_MIGRATION_NAME,
      finished_at: new Date(),
      rolled_back_at: null,
      logs: null
    },
    {
      migration_name: AUTH_WORKSPACE_MIGRATION_NAME,
      finished_at: null,
      rolled_back_at: null,
      logs: "ERROR: permission denied to create role\nDETAIL: Only roles with the CREATEROLE attribute may create roles."
    }
  ],
  artifacts: {
    private_definer_role_exists: true,
    resolve_user_workspaces_exists: false,
    definer_policies: []
  }
};

describe("foundation migration recovery", () => {
  it("allows rollback resolution only for the exact transactionally clean failure", () => {
    expect(decideFoundationRecovery(pristineFoundationFailure)).toEqual({
      action: "resolve-rolled-back",
      migration_name: FOUNDATION_MIGRATION_NAME
    });
  });

  it.each([
    {
      name: "a partial role",
      state: {
        ...pristineFoundationFailure,
        artifacts: { ...pristineFoundationFailure.artifacts, roles: ["marctco_app"] }
      }
    },
    {
      name: "a different error",
      state: {
        ...pristineFoundationFailure,
        migrations: [{ ...pristineFoundationFailure.migrations[0]!, logs: "permission denied for table" }]
      }
    },
    {
      name: "another unresolved migration",
      state: {
        ...pristineFoundationFailure,
        migrations: [
          ...pristineFoundationFailure.migrations,
          {
            migration_name: "another_migration",
            finished_at: null,
            rolled_back_at: null,
            logs: "failed"
          }
        ]
      }
    }
  ])("aborts when production has $name", ({ state }) => {
    expect(decideFoundationRecovery(state).action).toBe("abort");
  });

  it.each(["roles", "schemas", "types", "tables"] as const)(
    "aborts on %s without migration history",
    (artifact) => {
      const state: FoundationRecoveryState = {
        history_table_exists: false,
        migrations: [],
        artifacts: { roles: [], schemas: [], types: [], tables: [], [artifact]: ["residual"] }
      };
      expect(decideFoundationRecovery(state).action).toBe("abort");
    }
  );

  it("does not treat artifacts from an applied migration as residual", () => {
    const state: FoundationRecoveryState = {
      history_table_exists: true,
      migrations: [{ ...pristineFoundationFailure.migrations[0]!, finished_at: new Date() }],
      artifacts: {
        roles: ["marctco_app", "marctco_migrator", "marctco_worker"],
        schemas: ["private"],
        types: ["workspace_role"],
        tables: ["public.workspace_members", "public.workspaces"]
      }
    };
    expect(decideFoundationRecovery(state)).toEqual({
      action: "none",
      reason: "no unresolved failed migration"
    });
  });

  it("defers to other handlers when the unresolved migration is not foundation", () => {
    expect(
      decideFoundationRecovery({
        history_table_exists: true,
        migrations: pristineAuthFailure.migrations,
        artifacts: {
          roles: ["marctco_app", "marctco_migrator", "marctco_worker"],
          schemas: ["private"],
          types: ["workspace_role"],
          tables: ["public.workspace_members", "public.workspaces"]
        }
      })
    ).toEqual({
      action: "none",
      reason: "the unresolved migration is not the foundation migration"
    });
  });
});

describe("authentication workspace migration recovery", () => {
  it("allows rollback resolution when the role was bootstrapped and no 002 artifacts remain", () => {
    expect(decideAuthWorkspaceRecovery(pristineAuthFailure)).toEqual({
      action: "resolve-rolled-back",
      migration_name: AUTH_WORKSPACE_MIGRATION_NAME
    });
  });

  it("aborts with bootstrap SQL when marctco_private_definer is missing", () => {
    const decision = decideAuthWorkspaceRecovery({
      ...pristineAuthFailure,
      artifacts: { ...pristineAuthFailure.artifacts, private_definer_role_exists: false }
    });
    expect(decision.action).toBe("abort");
    if (decision.action === "abort") {
      expect(decision.reason).toContain(PRIVATE_DEFINER_BOOTSTRAP_SQL);
      expect(decision.reason).toContain("Supabase SQL Editor");
    }
  });

  it.each([
    {
      name: "resolve_user_workspaces",
      artifacts: { ...pristineAuthFailure.artifacts, resolve_user_workspaces_exists: true }
    },
    {
      name: "definer policies",
      artifacts: {
        ...pristineAuthFailure.artifacts,
        definer_policies: ["workspace_members_private_definer_select"]
      }
    },
    {
      name: "a different error",
      migrations: [
        pristineAuthFailure.migrations[0]!,
        {
          ...pristineAuthFailure.migrations[1]!,
          logs: "permission denied for table workspaces"
        }
      ]
    },
    {
      name: "another unresolved migration",
      migrations: [
        ...pristineAuthFailure.migrations,
        {
          migration_name: "20260805000300_empty_workspace_guc_fails_closed",
          finished_at: null,
          rolled_back_at: null,
          logs: "failed"
        }
      ]
    }
  ])("aborts when production has $name", ({ artifacts, migrations }) => {
    expect(
      decideAuthWorkspaceRecovery({
        ...pristineAuthFailure,
        artifacts: artifacts ?? pristineAuthFailure.artifacts,
        migrations: migrations ?? pristineAuthFailure.migrations
      }).action
    ).toBe("abort");
  });

  it("defers when the unresolved migration is not authentication workspace", () => {
    expect(
      decideAuthWorkspaceRecovery({
        ...pristineAuthFailure,
        migrations: [pristineFoundationFailure.migrations[0]!]
      })
    ).toEqual({
      action: "none",
      reason: "the unresolved migration is not the authentication workspace migration"
    });
  });
});

describe("combined migration recovery", () => {
  it("prefers foundation recovery before authentication workspace recovery", () => {
    expect(decideMigrationRecovery(pristineFoundationFailure, pristineAuthFailure)).toEqual({
      action: "resolve-rolled-back",
      migration_name: FOUNDATION_MIGRATION_NAME
    });
  });

  it("falls through to authentication workspace recovery when foundation does not apply", () => {
    expect(
      decideMigrationRecovery(
        {
          history_table_exists: true,
          migrations: pristineAuthFailure.migrations,
          artifacts: {
            roles: ["marctco_app", "marctco_migrator", "marctco_worker"],
            schemas: ["private"],
            types: ["workspace_role"],
            tables: ["public.workspace_members", "public.workspaces"]
          }
        },
        pristineAuthFailure
      )
    ).toEqual({
      action: "resolve-rolled-back",
      migration_name: AUTH_WORKSPACE_MIGRATION_NAME
    });
  });
});
