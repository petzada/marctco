/**
 * Who can open the operational Dashboard, and the four tiles that screen
 * always asks. Counts are computed by `getOperationalDashboard` with the
 * same `firstContactSla` / `stagnation` / `isActivityOverdue` functions the
 * listing uses; this module only names the tiles and their destinations so
 * the page never invents a fifth number or a filter of its own.
 *
 * Ticket 08 will append series onto the same named operation. Do not add a
 * second dashboard read for charts.
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
