import { describe, expect, it } from "vitest";
import { buildOperationalDashboardTiles } from "@marctco/domain";
import {
  buildDashboardChartsViewModel,
  buildDashboardNotificationViewModel,
  buildDashboardTileViewModel,
  burningNotificationsEmptyState
} from "./view-model";

const slug = "11111111-1111-4111-8111-111111111111";
const opportunity_id = "22222222-2222-4222-8222-222222222222";
const detected_at = new Date("2026-08-19T12:00:00.000Z");

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

describe("buildDashboardNotificationViewModel", () => {
  it("links the lead under the current workspace slug and distinguishes read from unread", () => {
    const unread = buildDashboardNotificationViewModel(
      {
        id: "33333333-3333-4333-8333-333333333333",
        opportunity_id,
        person_name: "Ana Time",
        type: "FIRST_CONTACT_SLA_BREACHED",
        detected_at,
        read_at: null
      },
      slug
    );
    expect(unread.href).toBe(`/workspace/${slug}/leads/${opportunity_id}`);
    expect(unread.type_label).toBe("SLA estourado");
    expect(unread.read).toBe(false);
    expect(unread.tone).toBe("danger");
    expect(unread.detected_label).toBe("19/08/2026 09:00");

    const read = buildDashboardNotificationViewModel(
      {
        id: "44444444-4444-4444-8444-444444444444",
        opportunity_id,
        person_name: "Bia Parada",
        type: "STAGNANT",
        detected_at,
        read_at: detected_at
      },
      "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
    );
    expect(read.href).toBe(
      `/workspace/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/leads/${opportunity_id}`
    );
    expect(read.type_label).toBe("Parado");
    expect(read.read).toBe(true);
    expect(read.tone).toBe("warning");
  });
});

describe("burningNotificationsEmptyState", () => {
  it("says in PT-BR that nothing is burning", () => {
    const copy = burningNotificationsEmptyState();
    expect(copy.title).toBe("Nada queimando agora");
    expect(copy.description).toContain("estourou");
    expect(copy.description).toContain("parado");
  });
});
