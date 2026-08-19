import type { OperationalDashboardTile, OperationalDashboardTileId } from "@marctco/domain";
import { dashboardTileHref } from "./hrefs";

const LABELS: Readonly<Record<OperationalDashboardTileId, string>> = {
  sla_breached: "SLA estourado",
  stagnant: "Leads parados",
  unassigned: "Sem responsável",
  overdue_activities: "Atividades vencidas"
};

const ACTION: Readonly<Record<"leads" | "agenda", string>> = {
  leads: "Abrir nos Leads",
  agenda: "Abrir na Agenda"
};

export type DashboardTileTone = "danger" | "warning" | "neutral";

export interface DashboardTileViewModel {
  readonly id: OperationalDashboardTileId;
  readonly label: string;
  readonly count: number;
  readonly href: string;
  readonly actionLabel: string;
  readonly tone: DashboardTileTone;
}

export function buildDashboardTileViewModel(
  tile: OperationalDashboardTile,
  slug: string
): DashboardTileViewModel {
  const burning = tile.count > 0;
  return {
    id: tile.id,
    label: LABELS[tile.id],
    count: tile.count,
    href: dashboardTileHref(slug, tile),
    actionLabel: ACTION[tile.destination.screen],
    tone: burning ? burningTone(tile.id) : "neutral"
  };
}

function burningTone(id: OperationalDashboardTileId): DashboardTileTone {
  switch (id) {
    case "stagnant":
      return "warning";
    case "unassigned":
      return "neutral";
    case "sla_breached":
    case "overdue_activities":
      return "danger";
    default: {
      const unhandled: never = id;
      throw new Error(`Unhandled dashboard tile: ${JSON.stringify(unhandled)}`);
    }
  }
}
