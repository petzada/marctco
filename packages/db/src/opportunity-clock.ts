import { Prisma, type PrismaClient } from "@prisma/client";
import {
  clockNotificationTypes,
  resolveWorkspaceSettings,
  type NotificationType,
  type ResolvedWorkspaceSettings
} from "@marctco/domain";
import type { JobContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export interface OverdueOpportunityWorkspace {
  readonly workspace_id: string;
}

interface SettingsRow {
  readonly first_contact_sla_minutes: number | null;
  readonly stagnation_days: number | null;
}

interface OpportunityClockRow {
  readonly id: string;
  readonly arrived_at: Date;
  readonly first_contact_at: Date | null;
  readonly closed_at: Date | null;
  readonly last_movement_at: Date | null;
  readonly status: "OPEN" | "WON" | "LOST";
  readonly merged_into_opportunity_id: string | null;
}

export interface OpportunityClockSweepResult {
  readonly upserted: number;
  readonly resolved: number;
}

/**
 * Discovery without a tenant. The private function answers with workspace
 * ids — never an opportunity, a person, or a payload (ADR-0019).
 */
export async function claimWorkspacesWithOverdueOpportunities(
  now: Date,
  prisma: PrismaClient = sharedPrisma
): Promise<OverdueOpportunityWorkspace[]> {
  if (Number.isNaN(now.getTime())) {
    throw new Error("claimWorkspacesWithOverdueOpportunities requires a valid instant");
  }
  return prisma.$queryRaw<OverdueOpportunityWorkspace[]>`
    SELECT workspace_id
    FROM private.claim_overdue_opportunity_workspaces(${now}::timestamptz)
  `;
}

/**
 * One tenant's clock pass: resolve notifications whose cause ended, upsert
 * the ones still burning. Idempotency is the UNIQUE constraint, never a
 * SELECT that came before. Runs under JobContext and SET LOCAL — no RLS
 * bypass.
 */
export async function sweepWorkspaceOpportunityClock(
  context: JobContext,
  now: Date,
  prisma: PrismaClient = sharedPrisma
): Promise<OpportunityClockSweepResult> {
  if (Number.isNaN(now.getTime())) {
    throw new Error("sweepWorkspaceOpportunityClock requires a valid instant");
  }
  if (context.origin.type !== "scheduled_sweep" || context.origin.sweep !== "OPPORTUNITY_CLOCK") {
    throw new Error("sweepWorkspaceOpportunityClock requires origin scheduled_sweep:OPPORTUNITY_CLOCK");
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const settingsRows = await transaction.$queryRaw<SettingsRow[]>`
      SELECT first_contact_sla_minutes, stagnation_days
      FROM workspace_settings
      WHERE workspace_id = ${context.workspace_id}::uuid
    `;
    const settings = resolveWorkspaceSettings(toStored(settingsRows[0]));

    const opportunities = await transaction.$queryRaw<OpportunityClockRow[]>`
      SELECT
        id,
        arrived_at,
        first_contact_at,
        closed_at,
        last_movement_at,
        status::text AS status,
        merged_into_opportunity_id
      FROM opportunities
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND status = 'OPEN'::opportunity_status
        AND merged_into_opportunity_id IS NULL
    `;

    const active = activeNotifications(opportunities, settings, now);

    let upserted = 0;
    if (active.length > 0) {
      const values = Prisma.join(
        active.map(
          (item) => Prisma.sql`(
            ${context.workspace_id}::uuid,
            ${item.opportunity_id}::uuid,
            ${item.type}::notification_type,
            ${now}::timestamptz,
            ${now}::timestamptz,
            ${now}::timestamptz
          )`
        )
      );
      upserted = await transaction.$executeRaw`
        INSERT INTO notifications (
          workspace_id,
          opportunity_id,
          type,
          detected_at,
          last_detected_at,
          created_at
        )
        VALUES ${values}
        ON CONFLICT (workspace_id, opportunity_id, type) DO UPDATE SET
          last_detected_at = EXCLUDED.last_detected_at,
          resolved_at = NULL,
          read_at = CASE
            WHEN notifications.resolved_at IS NULL THEN notifications.read_at
            ELSE NULL
          END,
          read_by_user_id = CASE
            WHEN notifications.resolved_at IS NULL THEN notifications.read_by_user_id
            ELSE NULL
          END
      `;
    }

    const resolved = await resolveInactive(transaction, context.workspace_id, now, active);
    return { upserted, resolved };
  });
}

function activeNotifications(
  opportunities: readonly OpportunityClockRow[],
  settings: ResolvedWorkspaceSettings,
  now: Date
): Array<{ opportunity_id: string; type: NotificationType }> {
  const active: Array<{ opportunity_id: string; type: NotificationType }> = [];
  for (const opportunity of opportunities) {
    for (const type of clockNotificationTypes(
      {
        arrived_at: opportunity.arrived_at,
        first_contact_at: opportunity.first_contact_at,
        closed_at: opportunity.closed_at,
        last_movement_at: opportunity.last_movement_at,
        status: opportunity.status,
        merged_into_opportunity_id: opportunity.merged_into_opportunity_id
      },
      settings,
      now
    )) {
      active.push({ opportunity_id: opportunity.id, type });
    }
  }
  return active;
}

async function resolveInactive(
  transaction: Prisma.TransactionClient,
  workspace_id: string,
  now: Date,
  active: ReadonlyArray<{ opportunity_id: string; type: NotificationType }>
): Promise<number> {
  if (active.length === 0) {
    return transaction.$executeRaw`
      UPDATE notifications
      SET resolved_at = ${now}::timestamptz
      WHERE workspace_id = ${workspace_id}::uuid
        AND resolved_at IS NULL
    `;
  }
  const keep = Prisma.join(
    active.map(
      (item) => Prisma.sql`(${item.opportunity_id}::uuid, ${item.type}::notification_type)`
    )
  );
  return transaction.$executeRaw`
    UPDATE notifications
    SET resolved_at = ${now}::timestamptz
    WHERE workspace_id = ${workspace_id}::uuid
      AND resolved_at IS NULL
      AND (opportunity_id, type) NOT IN (VALUES ${keep})
  `;
}

function toStored(row: SettingsRow | undefined): {
  first_contact_sla_minutes: number | null;
  stagnation_days: number | null;
} | null {
  if (!row) {
    return null;
  }
  return {
    first_contact_sla_minutes: row.first_contact_sla_minutes,
    stagnation_days: row.stagnation_days
  };
}
