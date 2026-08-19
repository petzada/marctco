import {
  firstContactSla,
  type FirstContactSlaOpportunityStatus
} from "./first-contact-sla.js";
import type { ResolvedWorkspaceSettings } from "./workspace-settings.js";

/**
 * Who can open the operational Dashboard, the four tiles that screen always
 * asks, and the three series ticket 08 adds to the same named operation.
 * Counts and SLA points use `firstContactSla` / `stagnation` /
 * `isActivityOverdue` so the page never invents a fifth number or a second
 * clock. Do not add a second dashboard read for charts.
 */

export const OPERATIONAL_DASHBOARD_TILE_IDS = [
  "sla_breached",
  "stagnant",
  "unassigned",
  "overdue_activities"
] as const;

export type OperationalDashboardTileId = (typeof OPERATIONAL_DASHBOARD_TILE_IDS)[number];

export type OperationalDashboardScreen = "leads" | "agenda";

export interface OperationalDashboardDestination {
  readonly screen: OperationalDashboardScreen;
  readonly query: Readonly<Record<string, string>>;
}

export interface OperationalDashboardCounts {
  readonly sla_breached: number;
  readonly stagnant: number;
  readonly unassigned: number;
  readonly overdue_activities: number;
}

export interface OperationalDashboardTile {
  readonly id: OperationalDashboardTileId;
  readonly count: number;
  readonly destination: OperationalDashboardDestination;
}

export type OperationalDashboardEmptyReason = "SUPERVISOR_WITHOUT_TEAM";

const DASHBOARD_READERS = new Set(["SUPERVISOR", "MANAGER", "OWNER"]);

/**
 * ADR-0015 matrix: Supervisor (time), Gestão and Direção (tudo). Atendente
 * is "—": the route refuses, it is not an empty scope.
 */
export function canReadOperationalDashboard(role: string): boolean {
  return DASHBOARD_READERS.has(role);
}

/**
 * Gestão and Direção see the ownerless queue. Supervisor never does
 * (ADR-0024); Atendente never reaches this screen.
 */
export function canSeeUnassignedQueueOnDashboard(role: string): boolean {
  return role === "MANAGER" || role === "OWNER";
}

export function operationalDashboardTileDestination(
  id: OperationalDashboardTileId
): OperationalDashboardDestination {
  switch (id) {
    case "sla_breached":
      return { screen: "leads", query: { clock: "sla-breached" } };
    case "stagnant":
      return { screen: "leads", query: { clock: "stagnant" } };
    case "unassigned":
      return { screen: "leads", query: { responsible: "unassigned" } };
    case "overdue_activities":
      return { screen: "agenda", query: { due: "overdue" } };
    default: {
      const unhandled: never = id;
      throw new Error(`Unhandled dashboard tile: ${JSON.stringify(unhandled)}`);
    }
  }
}

/**
 * The screen always receives these four tiles, in this order. A missing
 * tile would be a number that does not become an action.
 */
export function buildOperationalDashboardTiles(
  counts: OperationalDashboardCounts
): readonly OperationalDashboardTile[] {
  return OPERATIONAL_DASHBOARD_TILE_IDS.map((id) => ({
    id,
    count: counts[id],
    destination: operationalDashboardTileDestination(id)
  }));
}

/** Inclusive civil days ending today, in the workspace's operating zone. */
export const OPERATIONAL_DASHBOARD_RECENT_DAYS = 14;

export const OPERATIONAL_DASHBOARD_TIME_ZONE = "America/Sao_Paulo";

export const CATEGORICAL_CHART_COLOR_COUNT = 8;

export type CategoricalChartToken =
  | "chart-1"
  | "chart-2"
  | "chart-3"
  | "chart-4"
  | "chart-5"
  | "chart-6"
  | "chart-7"
  | "chart-8";

const CATEGORICAL_CHART_TOKENS: readonly CategoricalChartToken[] = [
  "chart-1",
  "chart-2",
  "chart-3",
  "chart-4",
  "chart-5",
  "chart-6",
  "chart-7",
  "chart-8"
];

/**
 * Overflow: restart at chart-1 after chart-8. Never invent a ninth hue and
 * never pad with semantic tones (DESIGN.md "Colors > Data visualization").
 */
export function categoricalChartToken(index: number): CategoricalChartToken {
  const slot =
    ((index % CATEGORICAL_CHART_COLOR_COUNT) + CATEGORICAL_CHART_COLOR_COUNT) %
    CATEGORICAL_CHART_COLOR_COUNT;
  return CATEGORICAL_CHART_TOKENS[slot] ?? "chart-1";
}

export interface ArrivalDayPoint {
  readonly day: string;
  readonly count: number;
}

export interface SlaAdherenceDayPoint {
  readonly day: string;
  readonly met: number;
  readonly breached: number;
  readonly pending: number;
  readonly adherence: number | null;
}

export interface OpenByStagePoint {
  readonly stage_id: string;
  readonly label: string;
  readonly position: number;
  readonly count: number;
  readonly color: CategoricalChartToken;
}

export interface OperationalDashboardSeries {
  readonly arrivals: readonly ArrivalDayPoint[];
  readonly sla_adherence: readonly SlaAdherenceDayPoint[];
  readonly open_by_stage: readonly OpenByStagePoint[];
}

export interface DashboardSeriesOpportunity {
  readonly arrived_at: Date;
  readonly first_contact_at: Date | null;
  readonly closed_at: Date | null;
  readonly status: FirstContactSlaOpportunityStatus;
}

export interface DashboardStage {
  readonly stage_id: string;
  readonly label: string;
  readonly position: number;
}

export function calendarDateKey(
  instant: Date,
  timeZone: string = OPERATIONAL_DASHBOARD_TIME_ZONE
): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(instant);
}

function shiftDateKey(dateKey: string, deltaDays: number): string {
  const shifted = new Date(`${dateKey}T12:00:00.000Z`);
  shifted.setUTCDate(shifted.getUTCDate() + deltaDays);
  return shifted.toISOString().slice(0, 10);
}

/**
 * First UTC instant whose civil date in `timeZone` is `dateKey`.
 */
export function startOfZonedDay(
  dateKey: string,
  timeZone: string = OPERATIONAL_DASHBOARD_TIME_ZONE
): Date {
  const noonUtc = Date.parse(`${dateKey}T12:00:00.000Z`);
  let low = noonUtc - 36 * 3_600_000;
  let high = noonUtc + 36 * 3_600_000;
  while (low < high) {
    const mid = Math.floor((low + high) / 2);
    if (calendarDateKey(new Date(mid), timeZone) < dateKey) {
      low = mid + 1;
    } else {
      high = mid;
    }
  }
  return new Date(low);
}

export function operationalDashboardWindowDays(
  now: Date,
  options: {
    readonly days?: number;
    readonly timeZone?: string;
  } = {}
): readonly string[] {
  const days = options.days ?? OPERATIONAL_DASHBOARD_RECENT_DAYS;
  const timeZone = options.timeZone ?? OPERATIONAL_DASHBOARD_TIME_ZONE;
  const today = calendarDateKey(now, timeZone);
  const window: string[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    window.push(shiftDateKey(today, -offset));
  }
  return window;
}

export function operationalDashboardWindowStart(
  now: Date,
  options: {
    readonly days?: number;
    readonly timeZone?: string;
  } = {}
): Date {
  const days = options.days ?? OPERATIONAL_DASHBOARD_RECENT_DAYS;
  const timeZone = options.timeZone ?? OPERATIONAL_DASHBOARD_TIME_ZONE;
  const window = operationalDashboardWindowDays(now, { days, timeZone });
  const first = window[0];
  if (first === undefined) {
    throw new Error("Dashboard window must contain at least one day");
  }
  return startOfZonedDay(first, timeZone);
}

export function buildOperationalDashboardSeries(input: {
  readonly now: Date;
  readonly settings: ResolvedWorkspaceSettings;
  readonly window_opportunities: readonly DashboardSeriesOpportunity[];
  readonly stages: readonly DashboardStage[];
  readonly open_stage_ids: readonly string[];
}): OperationalDashboardSeries {
  const days = operationalDashboardWindowDays(input.now);
  const arrivalsByDay = new Map(days.map((day) => [day, 0]));
  const slaByDay = new Map(
    days.map((day) => [day, { met: 0, breached: 0, pending: 0 }])
  );

  for (const opportunity of input.window_opportunities) {
    const day = calendarDateKey(opportunity.arrived_at);
    const arrival = arrivalsByDay.get(day);
    if (arrival !== undefined) {
      arrivalsByDay.set(day, arrival + 1);
    }
    const slaDay = slaByDay.get(day);
    if (slaDay === undefined) {
      continue;
    }
    const state = firstContactSla({
      arrived_at: opportunity.arrived_at,
      first_contact_at: opportunity.first_contact_at,
      closed_at: opportunity.closed_at,
      status: opportunity.status,
      settings: input.settings,
      now: input.now
    }).state;
    if (state === "MET") {
      slaDay.met += 1;
    } else if (state === "BREACHED") {
      slaDay.breached += 1;
    } else {
      slaDay.pending += 1;
    }
  }

  const orderedStages = [...input.stages].sort((left, right) => left.position - right.position);
  const openCounts = new Map<string, number>();
  for (const stage_id of input.open_stage_ids) {
    openCounts.set(stage_id, (openCounts.get(stage_id) ?? 0) + 1);
  }

  return {
    arrivals: days.map((day) => ({ day, count: arrivalsByDay.get(day) ?? 0 })),
    sla_adherence: days.map((day) => {
      const counts = slaByDay.get(day) ?? { met: 0, breached: 0, pending: 0 };
      const decided = counts.met + counts.breached;
      return {
        day,
        met: counts.met,
        breached: counts.breached,
        pending: counts.pending,
        adherence: decided === 0 ? null : counts.met / decided
      };
    }),
    open_by_stage: orderedStages.map((stage, index) => ({
      stage_id: stage.stage_id,
      label: stage.label,
      position: stage.position,
      count: openCounts.get(stage.stage_id) ?? 0,
      color: categoricalChartToken(index)
    }))
  };
}
