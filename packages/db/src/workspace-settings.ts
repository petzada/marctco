import type { PrismaClient } from "@prisma/client";
import {
  canWriteWorkspaceSettings,
  parseWorkspaceSettingsWrite,
  resolveWorkspaceSettings,
  type ResolvedWorkspaceSettings,
  type StoredWorkspaceSettings,
  type WorkspaceSettingsWrite
} from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

interface WorkspaceSettingsRow {
  readonly first_contact_sla_minutes: number | null;
  readonly stagnation_days: number | null;
}

export class WorkspaceSettingsWriteError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID") {
    super(code);
    this.name = "WorkspaceSettingsWriteError";
  }
}

/**
 * Reads the resolved clocks for this workspace. Every profile that can open
 * a lead needs the same numbers the later tickets will compare against;
 * absence of a row is the domain default, never "SLA off".
 */
export async function getWorkspaceSettings(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedWorkspaceSettings> {
  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<WorkspaceSettingsRow[]>`
      SELECT first_contact_sla_minutes, stagnation_days
      FROM workspace_settings
      WHERE workspace_id = ${context.workspace_id}::uuid
    `
  );
  return resolveWorkspaceSettings(toStored(rows[0]));
}

/**
 * Writes the clocks. Gestão and Direção only — the operation refuses
 * Atendente and Supervisor itself; hiding the form is not access control.
 * Invalid values are refused here, not discovered when a later ticket
 * computes the clock. The row is born on this first write.
 */
export async function updateWorkspaceSettings(
  context: UserContext,
  input: WorkspaceSettingsWrite,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedWorkspaceSettings> {
  if (!canWriteWorkspaceSettings(context.role)) {
    throw new WorkspaceSettingsWriteError("FORBIDDEN");
  }
  const parsed = parseWorkspaceSettingsWrite(input);
  if (!parsed.ok) {
    throw new WorkspaceSettingsWriteError("INVALID");
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const currentRows = await transaction.$queryRaw<WorkspaceSettingsRow[]>`
      SELECT first_contact_sla_minutes, stagnation_days
      FROM workspace_settings
      WHERE workspace_id = ${context.workspace_id}::uuid
    `;
    const current = toStored(currentRows[0]) ?? {
      first_contact_sla_minutes: null,
      stagnation_days: null
    };
    const next: StoredWorkspaceSettings = {
      first_contact_sla_minutes:
        parsed.value.first_contact_sla_minutes !== undefined
          ? parsed.value.first_contact_sla_minutes
          : current.first_contact_sla_minutes,
      stagnation_days:
        parsed.value.stagnation_days !== undefined
          ? parsed.value.stagnation_days
          : current.stagnation_days
    };

    await transaction.$executeRaw`
      INSERT INTO workspace_settings (
        workspace_id,
        first_contact_sla_minutes,
        stagnation_days,
        created_at,
        updated_at
      ) VALUES (
        ${context.workspace_id}::uuid,
        ${next.first_contact_sla_minutes},
        ${next.stagnation_days},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        first_contact_sla_minutes = EXCLUDED.first_contact_sla_minutes,
        stagnation_days = EXCLUDED.stagnation_days,
        updated_at = CURRENT_TIMESTAMP
    `;

    return resolveWorkspaceSettings(next);
  });
}

function toStored(row: WorkspaceSettingsRow | undefined): StoredWorkspaceSettings | null {
  if (!row) return null;
  return {
    first_contact_sla_minutes: row.first_contact_sla_minutes,
    stagnation_days: row.stagnation_days
  };
}
