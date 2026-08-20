import type { PrismaClient } from "@prisma/client";
import {
  canWriteWorkspaceSettings,
  parseFirstContactTemplate,
  parseWorkspaceSettingsWrite,
  resolveWorkspaceSettings,
  type ResolvedWorkspaceSettings,
  type StoredWorkspaceSettings,
  type WorkspaceSettingsWrite
} from "@marctco/domain";
import type { AccessContext, UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

interface WorkspaceSettingsRow {
  readonly first_contact_sla_minutes: number | null;
  readonly stagnation_days: number | null;
  readonly first_contact_trigger: "ON_ASSIGNMENT" | "ON_ARRIVAL" | "DISABLED" | null;
  readonly first_contact_template_body: string | null;
}

export class WorkspaceSettingsWriteError extends Error {
  constructor(readonly code: "FORBIDDEN" | "INVALID") {
    super(code);
    this.name = "WorkspaceSettingsWriteError";
  }
}

/**
 * Reads the resolved clocks and first-contact configuration for this
 * workspace. Users and jobs share the same named read: absence of a row is
 * the domain default, never "SLA off" and never DISABLED (ADR-0004).
 */
export async function getWorkspaceSettings(
  context: AccessContext,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedWorkspaceSettings> {
  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<WorkspaceSettingsRow[]>`
      SELECT
        first_contact_sla_minutes,
        stagnation_days,
        first_contact_trigger,
        first_contact_template_body
      FROM workspace_settings
      WHERE workspace_id = ${context.workspace_id}::uuid
    `
  );
  return resolveWorkspaceSettings(toStored(rows[0]));
}

/**
 * Writes clocks and first-contact configuration. Gestão and Direção only —
 * the operation refuses Atendente and Supervisor itself; hiding the form is
 * not access control. Invalid trigger/template pairs are refused here, after
 * merging with what is already stored, so a partial write cannot leave a
 * forbidden variable in place.
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
  const update_first_contact_trigger = parsed.value.first_contact_trigger !== undefined;
  const update_first_contact_template_body =
    parsed.value.first_contact_template_body !== undefined;

  return withAccessContext(prisma, context, async (transaction) => {
    const existing = await transaction.$queryRaw<WorkspaceSettingsRow[]>`
      SELECT
        first_contact_sla_minutes,
        stagnation_days,
        first_contact_trigger,
        first_contact_template_body
      FROM workspace_settings
      WHERE workspace_id = ${context.workspace_id}::uuid
    `;
    const stored = toStored(existing[0]);
    const merged: StoredWorkspaceSettings = {
      first_contact_sla_minutes:
        parsed.value.first_contact_sla_minutes !== undefined
          ? parsed.value.first_contact_sla_minutes
          : (stored?.first_contact_sla_minutes ?? null),
      stagnation_days:
        parsed.value.stagnation_days !== undefined
          ? parsed.value.stagnation_days
          : (stored?.stagnation_days ?? null),
      first_contact_trigger:
        (update_first_contact_trigger
          ? parsed.value.first_contact_trigger
          : stored?.first_contact_trigger) ?? null,
      first_contact_template_body:
        (update_first_contact_template_body
          ? parsed.value.first_contact_template_body
          : stored?.first_contact_template_body) ?? null
    };
    if (update_first_contact_trigger || update_first_contact_template_body) {
      const resolved = resolveWorkspaceSettings(merged);
      if (
        !parseFirstContactTemplate({
          trigger: resolved.first_contact_trigger,
          template_body: resolved.first_contact_template_body
        }).ok
      ) {
        throw new WorkspaceSettingsWriteError("INVALID");
      }
    }

    await transaction.$executeRaw`
      INSERT INTO workspace_settings (
        workspace_id,
        first_contact_sla_minutes,
        stagnation_days,
        first_contact_trigger,
        first_contact_template_body,
        created_at,
        updated_at
      ) VALUES (
        ${context.workspace_id}::uuid,
        ${update_first_contact_sla_minutes ? parsed.value.first_contact_sla_minutes : null},
        ${update_stagnation_days ? parsed.value.stagnation_days : null},
        ${update_first_contact_trigger ? parsed.value.first_contact_trigger : null}::first_contact_trigger,
        ${update_first_contact_template_body ? parsed.value.first_contact_template_body : null},
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
        first_contact_trigger = CASE
          WHEN ${update_first_contact_trigger} THEN EXCLUDED.first_contact_trigger
          ELSE workspace_settings.first_contact_trigger
        END,
        first_contact_template_body = CASE
          WHEN ${update_first_contact_template_body} THEN EXCLUDED.first_contact_template_body
          ELSE workspace_settings.first_contact_template_body
        END,
        updated_at = CURRENT_TIMESTAMP
    `;

    const rows = await transaction.$queryRaw<WorkspaceSettingsRow[]>`
      SELECT
        first_contact_sla_minutes,
        stagnation_days,
        first_contact_trigger,
        first_contact_template_body
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
    stagnation_days: row.stagnation_days,
    first_contact_trigger: row.first_contact_trigger,
    first_contact_template_body: row.first_contact_template_body
  };
}
