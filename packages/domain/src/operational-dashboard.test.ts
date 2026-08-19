import { describe, expect, it } from "vitest";
import { DEFAULT_FIRST_CONTACT_SLA_MINUTES } from "./workspace-settings.js";
import {
  OPERATIONAL_DASHBOARD_RECENT_DAYS,
  OPERATIONAL_DASHBOARD_TIME_ZONE,
  buildOperationalDashboardSeries,
  buildOperationalDashboardTiles,
  calendarDateKey,
  canReadOperationalDashboard,
  canSeeUnassignedQueueOnDashboard,
  categoricalChartToken,
  operationalDashboardTileDestination,
  operationalDashboardWindowDays,
  operationalDashboardWindowStart,
  startOfZonedDay
} from "./operational-dashboard.js";

describe("canReadOperationalDashboard", () => {
  it("allows Supervisor, Gestão and Direção, and refuses Atendente", () => {
    expect(canReadOperationalDashboard("SUPERVISOR")).toBe(true);
    expect(canReadOperationalDashboard("MANAGER")).toBe(true);
    expect(canReadOperationalDashboard("OWNER")).toBe(true);
    expect(canReadOperationalDashboard("ATTENDANT")).toBe(false);
  });
});

describe("canSeeUnassignedQueueOnDashboard", () => {
  it("is only Gestão and Direção — the ownerless queue is not the Supervisor's", () => {
    expect(canSeeUnassignedQueueOnDashboard("MANAGER")).toBe(true);
    expect(canSeeUnassignedQueueOnDashboard("OWNER")).toBe(true);
    expect(canSeeUnassignedQueueOnDashboard("SUPERVISOR")).toBe(false);
    expect(canSeeUnassignedQueueOnDashboard("ATTENDANT")).toBe(false);
  });
});

describe("operationalDashboardTileDestination", () => {
  it("sends each tile to Leads or Agenda with the filter already in the query", () => {
    expect(operationalDashboardTileDestination("sla_breached")).toEqual({
      screen: "leads",
      query: { clock: "sla-breached" }
    });
    expect(operationalDashboardTileDestination("stagnant")).toEqual({
      screen: "leads",
      query: { clock: "stagnant" }
    });
    expect(operationalDashboardTileDestination("unassigned")).toEqual({
      screen: "leads",
      query: { responsible: "unassigned" }
    });
    expect(operationalDashboardTileDestination("overdue_activities")).toEqual({
      screen: "agenda",
      query: { due: "overdue" }
    });
  });
});

describe("buildOperationalDashboardTiles", () => {
  it("always returns the four tiles in the same order, including zeros", () => {
    const tiles = buildOperationalDashboardTiles({
      sla_breached: 2,
      stagnant: 0,
      unassigned: 4,
      overdue_activities: 1
    });
    expect(tiles.map((tile) => tile.id)).toEqual([
      "sla_breached",
      "stagnant",
      "unassigned",
      "overdue_activities"
    ]);
    expect(tiles.map((tile) => tile.count)).toEqual([2, 0, 4, 1]);
    expect(tiles[0]?.destination.query).toEqual({ clock: "sla-breached" });
  });
});

describe("categoricalChartToken", () => {
  it("walks chart-1 through chart-8 and wraps instead of inventing a ninth hue", () => {
    expect(categoricalChartToken(0)).toBe("chart-1");
    expect(categoricalChartToken(7)).toBe("chart-8");
    expect(categoricalChartToken(8)).toBe("chart-1");
    expect(categoricalChartToken(9)).toBe("chart-2");
    expect(categoricalChartToken(-1)).toBe("chart-8");
  });
});

describe("operational dashboard window", () => {
  const noonInSaoPaulo = new Date("2026-08-19T15:00:00.000Z");

  it("is fourteen civil days ending today in America/Sao_Paulo", () => {
    const days = operationalDashboardWindowDays(noonInSaoPaulo);
    expect(days).toHaveLength(OPERATIONAL_DASHBOARD_RECENT_DAYS);
    expect(days[0]).toBe("2026-08-06");
    expect(days[days.length - 1]).toBe("2026-08-19");
    expect(calendarDateKey(noonInSaoPaulo, OPERATIONAL_DASHBOARD_TIME_ZONE)).toBe(
      "2026-08-19"
    );
  });

  it("starts the window at midnight in Sao Paulo, not at UTC midnight", () => {
    const stillYesterday = new Date("2026-08-19T02:30:00.000Z");
    const days = operationalDashboardWindowDays(stillYesterday);
    expect(days[days.length - 1]).toBe("2026-08-18");
    expect(startOfZonedDay("2026-08-19").toISOString()).toBe("2026-08-19T03:00:00.000Z");
    expect(operationalDashboardWindowStart(noonInSaoPaulo).toISOString()).toBe(
      "2026-08-06T03:00:00.000Z"
    );
  });
});

describe("buildOperationalDashboardSeries", () => {
  const now = new Date("2026-08-19T15:00:00.000Z");
  const settings = {
    first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
    stagnation_days: 7
  };
  const stages = [
    { stage_id: "entry", label: "Novo lead", position: 1 },
    { stage_id: "talk", label: "Em atendimento", position: 2 },
    { stage_id: "close", label: "Negociação final", position: 3 }
  ];

  it("fills every day of the window with zeros when nothing arrived", () => {
    const series = buildOperationalDashboardSeries({
      now,
      settings,
      window_opportunities: [],
      stages,
      open_stage_ids: []
    });
    expect(series.arrivals).toHaveLength(14);
    expect(series.arrivals.every((point) => point.count === 0)).toBe(true);
    expect(series.sla_adherence.every((point) => point.adherence === null)).toBe(true);
    expect(series.open_by_stage.map((point) => point.count)).toEqual([0, 0, 0]);
    expect(series.open_by_stage.map((point) => point.color)).toEqual([
      "chart-1",
      "chart-2",
      "chart-3"
    ]);
  });

  it("counts arrivals on the civil day in Sao Paulo, including closed leads", () => {
    const series = buildOperationalDashboardSeries({
      now,
      settings,
      window_opportunities: [
        {
          arrived_at: new Date("2026-08-19T14:00:00.000Z"),
          first_contact_at: null,
          closed_at: null,
          status: "OPEN"
        },
        {
          arrived_at: new Date("2026-08-18T18:00:00.000Z"),
          first_contact_at: new Date("2026-08-18T18:30:00.000Z"),
          closed_at: new Date("2026-08-18T19:00:00.000Z"),
          status: "WON"
        },
        {
          arrived_at: new Date("2026-08-01T15:00:00.000Z"),
          first_contact_at: null,
          closed_at: null,
          status: "OPEN"
        }
      ],
      stages,
      open_stage_ids: []
    });
    expect(series.arrivals.find((point) => point.day === "2026-08-19")?.count).toBe(1);
    expect(series.arrivals.find((point) => point.day === "2026-08-18")?.count).toBe(1);
    expect(series.arrivals.find((point) => point.day === "2026-08-06")?.count).toBe(0);
  });

  it("computes SLA adherence with firstContactSla and excludes pending from the rate", () => {
    const series = buildOperationalDashboardSeries({
      now,
      settings,
      window_opportunities: [
        {
          arrived_at: new Date("2026-08-18T12:00:00.000Z"),
          first_contact_at: new Date("2026-08-18T13:00:00.000Z"),
          closed_at: null,
          status: "OPEN"
        },
        {
          arrived_at: new Date("2026-08-18T12:00:00.000Z"),
          first_contact_at: new Date("2026-08-18T15:00:00.000Z"),
          closed_at: null,
          status: "OPEN"
        },
        {
          arrived_at: new Date("2026-08-19T14:00:00.000Z"),
          first_contact_at: null,
          closed_at: null,
          status: "OPEN"
        }
      ],
      stages,
      open_stage_ids: []
    });
    const eighteenth = series.sla_adherence.find((point) => point.day === "2026-08-18");
    expect(eighteenth).toEqual({
      day: "2026-08-18",
      met: 1,
      breached: 1,
      pending: 0,
      adherence: 0.5
    });
    const nineteenth = series.sla_adherence.find((point) => point.day === "2026-08-19");
    expect(nineteenth?.pending).toBe(1);
    expect(nineteenth?.adherence).toBeNull();
  });

  it("keeps every default-funnel stage, including zeros, in position order", () => {
    const series = buildOperationalDashboardSeries({
      now,
      settings,
      window_opportunities: [],
      stages: [
        { stage_id: "close", label: "Negociação final", position: 3 },
        { stage_id: "entry", label: "Novo lead", position: 1 },
        { stage_id: "talk", label: "Em atendimento", position: 2 }
      ],
      open_stage_ids: ["talk", "talk", "entry"]
    });
    expect(series.open_by_stage.map((point) => point.stage_id)).toEqual([
      "entry",
      "talk",
      "close"
    ]);
    expect(series.open_by_stage.map((point) => point.count)).toEqual([1, 2, 0]);
  });
});
