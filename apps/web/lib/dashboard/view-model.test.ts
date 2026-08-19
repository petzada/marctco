import { describe, expect, it } from "vitest";
import { buildOperationalDashboardTiles } from "@marctco/domain";
import { buildDashboardChartsViewModel, buildDashboardTileViewModel } from "./view-model";

const slug = "11111111-1111-4111-8111-111111111111";

describe("buildDashboardTileViewModel", () => {
  it("labels the four tiles in PT-BR and keeps zeros clickable", () => {
    const [sla, stagnant, unassigned, overdue] = buildOperationalDashboardTiles({
      sla_breached: 3,
      stagnant: 1,
      unassigned: 0,
      overdue_activities: 2
    }).map((tile) => buildDashboardTileViewModel(tile, slug));

    expect(sla?.label).toBe("SLA estourado");
    expect(sla?.href).toBe(`/workspace/${slug}/leads?clock=sla-breached`);
    expect(sla?.tone).toBe("danger");
    expect(sla?.actionLabel).toBe("Abrir nos Leads");

    expect(stagnant?.label).toBe("Leads parados");
    expect(stagnant?.tone).toBe("warning");

    expect(unassigned?.label).toBe("Sem responsável");
    expect(unassigned?.href).toBe(`/workspace/${slug}/leads?responsible=unassigned`);
    expect(unassigned?.tone).toBe("neutral");

    expect(overdue?.label).toBe("Atividades vencidas");
    expect(overdue?.href).toBe(`/workspace/${slug}/agenda?due=overdue`);
    expect(overdue?.actionLabel).toBe("Abrir na Agenda");
  });
});

describe("buildDashboardChartsViewModel", () => {
  it("labels days in PT-BR and leaves pending SLA without a rate", () => {
    const charts = buildDashboardChartsViewModel({
      arrivals: [{ day: "2026-08-19", count: 4 }],
      sla_adherence: [
        { day: "2026-08-18", met: 1, breached: 1, pending: 0, adherence: 0.5 },
        { day: "2026-08-19", met: 0, breached: 0, pending: 2, adherence: null }
      ],
      open_by_stage: [
        {
          stage_id: "entry",
          label: "Novo lead",
          position: 1,
          count: 3,
          color: "chart-1"
        },
        {
          stage_id: "talk",
          label: "Em atendimento",
          position: 2,
          count: 1,
          color: "chart-2"
        }
      ]
    });
    expect(charts.arrivals[0]?.label).toBe("19/08");
    expect(charts.sla_adherence[0]?.rateLabel).toBe("50%");
    expect(charts.sla_adherence[1]?.rateLabel).toBe("Sem resultado");
    expect(charts.open_by_stage[0]?.share).toBe(0.75);
  });
});
