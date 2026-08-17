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

  const update_first_contact_sla_minutes =
    parsed.value.first_contact_sla_minutes !== undefined;
  const update_stagnation_days = parsed.value.stagnation_days !== undefined;

  return withAccessContext(prisma, context, async (transaction) => {
    await transaction.$executeRaw`
      INSERT INTO workspace_settings (
        workspace_id,
        first_contact_sla_minutes,
        stagnation_days,
        created_at,
        updated_at
      ) VALUES (
        ${context.workspace_id}::uuid,
        ${update_first_contact_sla_minutes ? parsed.value.first_contact_sla_minutes : null},
        ${update_stagnation_days ? parsed.value.stagnation_days : null},
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (workspace_id) DO UPDATE SET
        first_contact_sla_minutes = CASE
          WHEN ${update_first_contact_sla_minutes} THEN EXCLUDED.first_contact_sla_minutes
          ELSE workspace_settings.first_contact_sla_minutes
        END,
        stagnation_days = CASE
          WHEN ${update_stagnation_days} THEN EXCLUDED.stagnation_days
          ELSE workspace_settings.stagnation_days
        END,
        updated_at = CURRENT_TIMESTAMP
    `;

    const rows = await transaction.$queryRaw<WorkspaceSettingsRow[]>`
      SELECT first_contact_sla_minutes, stagnation_days
      FROM workspace_settings
      WHERE workspace_id = ${context.workspace_id}::uuid
    `;
    return resolveWorkspaceSettings(toStored(rows[0]));
  });
}

function toStored(row: WorkspaceSettingsRow | undefined): StoredWorkspaceSettings | null {
  if (!row) return null;
  return {
    first_contact_sla_minutes: row.first_contact_sla_minutes,
    stagnation_days: row.stagnation_days
  };
}
