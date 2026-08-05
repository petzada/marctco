import { describe, expect, it } from "vitest";
import {
  decideFoundationRecovery,
  FOUNDATION_MIGRATION_NAME,
  type FoundationRecoveryState
} from "./foundation-recovery.js";

const pristine_failure: FoundationRecoveryState = {
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

describe("foundation migration recovery", () => {
  it("allows rollback resolution only for the exact transactionally clean failure", () => {
    expect(decideFoundationRecovery(pristine_failure)).toEqual({
      action: "resolve-rolled-back",
      migration_name: FOUNDATION_MIGRATION_NAME
    });
  });

  it.each([
    {
      name: "a partial role",
      state: { ...pristine_failure, artifacts: { ...pristine_failure.artifacts, roles: ["marctco_app"] } }
    },
    {
      name: "a different error",
      state: {
        ...pristine_failure,
        migrations: [{ ...pristine_failure.migrations[0]!, logs: "permission denied for table" }]
      }
    },
    {
      name: "another unresolved migration",
      state: {
        ...pristine_failure,
        migrations: [
          ...pristine_failure.migrations,
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
      migrations: [{ ...pristine_failure.migrations[0]!, finished_at: new Date() }],
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
});
