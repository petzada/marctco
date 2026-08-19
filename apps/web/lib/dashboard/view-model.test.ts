import { describe, expect, it } from "vitest";
import { buildOperationalDashboardTiles } from "@marctco/domain";
import { buildDashboardTileViewModel } from "./view-model";

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
