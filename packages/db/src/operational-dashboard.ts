import { Prisma, type PrismaClient } from "@prisma/client";
import {
  buildOperationalDashboardSeries,
  buildOperationalDashboardTiles,
  canReadOperationalDashboard,
  canSeeUnassignedQueueOnDashboard,
  firstContactSla,
  isActivityOverdue,
  operationalDashboardWindowStart,
  resolveWorkspaceSettings,
  stagnation,
  type DashboardSeriesOpportunity,
  type FirstContactSlaOpportunityStatus,
  type OperationalDashboardEmptyReason,
  type OperationalDashboardSeries,
  type OperationalDashboardTile,
  type ResolvedWorkspaceSettings
} from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export type OperationalDashboardRefusal = "FORBIDDEN";

export class OperationalDashboardError extends Error {
  constructor(readonly reason: OperationalDashboardRefusal) {
    super(reason);
    this.name = "OperationalDashboardError";
  }
}

export interface OperationalDashboardEmptyState {
  readonly reason: OperationalDashboardEmptyReason;
}

/**
 * The Dashboard screen's only query. Tiles and series live here so the page
 * never assembles a `where` and never opens extra pooled connections for
 * one look at the morning (ADR-0013, item A19).
 */
export interface OperationalDashboard {
  readonly tiles: readonly OperationalDashboardTile[];
  readonly series: OperationalDashboardSeries;
  readonly empty_state: OperationalDashboardEmptyState | null;
}

export interface GetOperationalDashboardOptions {
  readonly now: Date;
}

interface SettingsRow {
  readonly first_contact_sla_minutes: number | null;
  readonly stagnation_days: number | null;
}

interface OpportunityClockRow {
  readonly arrived_at: Date;
  readonly first_contact_at: Date | null;
  readonly closed_at: Date | null;
  readonly last_movement_at: Date | null;
  readonly assigned_user_id: string | null;
  readonly status: FirstContactSlaOpportunityStatus;
  readonly stage_id: string;
  readonly pipeline_is_default: boolean;
  readonly pipeline_type: "COMMERCIAL" | "LEGAL";
}

interface DashboardStageRow {
  readonly stage_id: string;
  readonly label: string;
  readonly position: number;
}

interface OverdueActivityRow {
  readonly due_at: Date;
}

interface TagPresenceRow {
  readonly present: boolean;
}

/**
 * Answers the four numbers of the morning and the three series, in the
 * actor's profile scope. Atendente is refused here, not only by a missing
 * nav item. Supervisor without a tag gets zeros plus an empty state that
 * names the cause (ADR-0015, ADR-0024).
 */
export async function getOperationalDashboard(
  context: UserContext,
  options: GetOperationalDashboardOptions,
  prisma: PrismaClient = sharedPrisma
): Promise<OperationalDashboard> {
  if (!canReadOperationalDashboard(context.role)) {
    throw new OperationalDashboardError("FORBIDDEN");
  }

  const now = options.now;
  const seesUnassigned = canSeeUnassignedQueueOnDashboard(context.role);
  const windowStart = operationalDashboardWindowStart(now);

  return withAccessContext(prisma, context, async (transaction) => {
    const settingsPromise = transaction.$queryRaw<SettingsRow[]>`
      SELECT first_contact_sla_minutes, stagnation_days
      FROM workspace_settings
      WHERE workspace_id = ${context.workspace_id}::uuid
    `;
    const opportunitiesPromise = transaction.$queryRaw<OpportunityClockRow[]>(Prisma.sql`
      SELECT
        opportunity.arrived_at,
        opportunity.first_contact_at,
        opportunity.closed_at,
        opportunity.last_movement_at,
        opportunity.assigned_user_id,
        opportunity.status,
        opportunity.stage_id,
        pipeline.is_default AS pipeline_is_default,
        pipeline.type AS pipeline_type
      FROM opportunities AS opportunity
      JOIN pipelines AS pipeline
        ON pipeline.workspace_id = opportunity.workspace_id
       AND pipeline.id = opportunity.pipeline_id
      WHERE opportunity.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.merged_into_opportunity_id IS NULL
        AND (
          opportunity.status = 'OPEN'::opportunity_status
          OR opportunity.arrived_at >= ${windowStart}
        )
        ${opportunityScopeSql(context, "opportunity")}
    `);
    const activitiesPromise = transaction.$queryRaw<OverdueActivityRow[]>(Prisma.sql`
      SELECT activity.due_at
      FROM activities AS activity
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = activity.workspace_id
       AND opportunity.id = activity.opportunity_id
      WHERE activity.workspace_id = ${context.workspace_id}::uuid
        AND activity.status = 'OPEN'::activity_status
        AND activity.due_at < ${now}
        AND opportunity.merged_into_opportunity_id IS NULL
        ${opportunityScopeSql(context, "opportunity")}
    `);
    const tagPromise =
      context.role === "SUPERVISOR"
        ? transaction.$queryRaw<TagPresenceRow[]>`
            SELECT EXISTS (
              SELECT 1
              FROM member_tags AS member_tag
              WHERE member_tag.workspace_id = ${context.workspace_id}::uuid
                AND member_tag.user_id = ${context.user_id}::uuid
            ) AS present
          `
        : Promise.resolve([{ present: true }]);
    const stagesPromise = transaction.$queryRaw<DashboardStageRow[]>(Prisma.sql`
      SELECT stage.id AS stage_id, stage.label, stage.position
      FROM stages AS stage
      JOIN pipelines AS commercial
        ON commercial.workspace_id = stage.workspace_id
       AND commercial.id = stage.pipeline_id
      WHERE stage.workspace_id = ${context.workspace_id}::uuid
        AND commercial.type = 'COMMERCIAL'::pipeline_type
        AND commercial.is_default = true
      ORDER BY stage.position ASC
    `);

    const [settingsRows, opportunities, activities, tagRows, stages] = await Promise.all([
      settingsPromise,
      opportunitiesPromise,
      activitiesPromise,
      tagPromise,
      stagesPromise
    ]);

    const settings = resolveWorkspaceSettings(toStored(settingsRows[0]));
    const counts = {
      sla_breached: 0,
      stagnant: 0,
      unassigned: 0,
      overdue_activities: 0
    };
    const window_opportunities: DashboardSeriesOpportunity[] = [];
    const open_stage_ids: string[] = [];

    for (const opportunity of opportunities) {
      const status = clockStatus(opportunity.status);
      if (opportunity.arrived_at >= windowStart) {
        window_opportunities.push({
          arrived_at: opportunity.arrived_at,
          first_contact_at: opportunity.first_contact_at,
          closed_at: opportunity.closed_at,
          status
        });
      }
      if (status !== "OPEN") {
        continue;
      }
      if (isSlaBreached(opportunity, settings, now)) {
        counts.sla_breached += 1;
      }
      if (isStagnant(opportunity, settings, now)) {
        counts.stagnant += 1;
      }
      if (seesUnassigned && opportunity.assigned_user_id === null) {
        counts.unassigned += 1;
      }
      if (opportunity.pipeline_is_default && opportunity.pipeline_type === "COMMERCIAL") {
        open_stage_ids.push(opportunity.stage_id);
      }
    }

    for (const activity of activities) {
      if (isActivityOverdue({ status: "OPEN", due_at: activity.due_at, now })) {
        counts.overdue_activities += 1;
      }
    }

    const missingTeam = context.role === "SUPERVISOR" && tagRows[0]?.present !== true;
    return {
      tiles: buildOperationalDashboardTiles(counts),
      series: buildOperationalDashboardSeries({
        now,
        settings,
        window_opportunities,
        stages,
        open_stage_ids
      }),
      empty_state: missingTeam ? { reason: "SUPERVISOR_WITHOUT_TEAM" } : null
    };
  });
}

function clockStatus(status: FirstContactSlaOpportunityStatus): FirstContactSlaOpportunityStatus {
  if (status === "WON" || status === "LOST") {
    return status;
  }
  return "OPEN";
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

function isSlaBreached(
  opportunity: OpportunityClockRow,
  settings: ResolvedWorkspaceSettings,
  now: Date
): boolean {
  return (
    firstContactSla({
      arrived_at: opportunity.arrived_at,
      first_contact_at: opportunity.first_contact_at,
      closed_at: opportunity.closed_at,
      status: "OPEN",
      settings,
      now
    }).state === "BREACHED"
  );
}

function isStagnant(
  opportunity: OpportunityClockRow,
  settings: ResolvedWorkspaceSettings,
  now: Date
): boolean {
  return (
    stagnation({
      arrived_at: opportunity.arrived_at,
      last_movement_at: opportunity.last_movement_at,
      status: "OPEN",
      merged_into_opportunity_id: null,
      settings,
      now
    }).state === "STAGNANT"
  );
}
