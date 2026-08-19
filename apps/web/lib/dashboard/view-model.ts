import type {
  ArrivalDayPoint,
  CategoricalChartToken,
  NotificationType,
  OpenByStagePoint,
  OperationalDashboardSeries,
  OperationalDashboardTile,
  OperationalDashboardTileId,
  SlaAdherenceDayPoint
} from "@marctco/domain";
import { formatArrivedAt } from "../leads/row-view-model";
import { markerPresentation } from "../leads/markers";
import { dashboardLeadHref, dashboardTileHref } from "./hrefs";

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

export interface DashboardNotificationSource {
  readonly id: string;
  readonly opportunity_id: string;
  readonly person_name: string;
  readonly type: NotificationType;
  readonly detected_at: Date;
  readonly read_at: Date | null;
}

export type DashboardNotificationTone = "danger" | "warning";

export interface DashboardNotificationViewModel {
  readonly id: string;
  readonly href: string;
  readonly person_name: string;
  readonly type_label: string;
  readonly detected_label: string;
  readonly read: boolean;
  readonly tone: DashboardNotificationTone;
}

export function burningNotificationsEmptyState(): {
  readonly title: string;
  readonly description: string;
} {
  return {
    title: "Nada queimando agora",
    description: "Nenhum lead estourou o SLA nem ficou parado. A varredura avisa quando isso mudar."
  };
}

export function buildDashboardNotificationViewModel(
  item: DashboardNotificationSource,
  slug: string
): DashboardNotificationViewModel {
  return {
    id: item.id,
    href: dashboardLeadHref(slug, item.opportunity_id),
    person_name: item.person_name,
    type_label: markerPresentation(item.type).label,
    detected_label: formatArrivedAt(item.detected_at),
    read: item.read_at !== null,
    tone: item.type === "STAGNANT" ? "warning" : "danger"
  };
}

export interface ArrivalChartPoint {
  readonly day: string;
  readonly label: string;
  readonly count: number;
}

export interface SlaAdherenceChartPoint {
  readonly day: string;
  readonly label: string;
  readonly adherence: number | null;
  readonly rateLabel: string;
}

export interface StageChartPoint {
  readonly stage_id: string;
  readonly label: string;
  readonly count: number;
  readonly color: CategoricalChartToken;
  readonly share: number;
}

export interface DashboardChartsViewModel {
  readonly arrivals: readonly ArrivalChartPoint[];
  readonly sla_adherence: readonly SlaAdherenceChartPoint[];
  readonly open_by_stage: readonly StageChartPoint[];
}

export function formatDashboardDayLabel(day: string): string {
  const parts = day.split("-");
  const month = parts[1];
  const date = parts[2];
  if (month === undefined || date === undefined) {
    return day;
  }
  return `${date}/${month}`;
}

export function formatSlaAdherenceLabel(adherence: number | null): string {
  if (adherence === null) {
    return "Sem resultado";
  }
  return `${Math.round(adherence * 100)}%`;
}

export function buildDashboardChartsViewModel(
  series: OperationalDashboardSeries
): DashboardChartsViewModel {
  const stageTotal = series.open_by_stage.reduce((sum, point) => sum + point.count, 0);
  return {
    arrivals: series.arrivals.map((point: ArrivalDayPoint) => ({
      day: point.day,
      label: formatDashboardDayLabel(point.day),
      count: point.count
    })),
    sla_adherence: series.sla_adherence.map((point: SlaAdherenceDayPoint) => ({
      day: point.day,
      label: formatDashboardDayLabel(point.day),
      adherence: point.adherence,
      rateLabel: formatSlaAdherenceLabel(point.adherence)
    })),
    open_by_stage: series.open_by_stage.map((point: OpenByStagePoint) => ({
      stage_id: point.stage_id,
      label: point.label,
      count: point.count,
      color: point.color,
      share: stageTotal === 0 ? 0 : point.count / stageTotal
    }))
  };
}
