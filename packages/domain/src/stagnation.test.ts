import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  DEFAULT_STAGNATION_DAYS,
  type ResolvedWorkspaceSettings
} from "./workspace-settings.js";
import { stagnation } from "./stagnation.js";

const settings: ResolvedWorkspaceSettings = {
  first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  stagnation_days: DEFAULT_STAGNATION_DAYS
};

const arrived_at = new Date("2026-08-10T12:00:00.000Z");

function atDays(days: number): Date {
  return new Date(arrived_at.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("stagnation", () => {
  it("keeps an open lead MOVING while the wait is still inside the limit", () => {
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "OPEN",
        merged_into_opportunity_id: null,
        settings,
        now: atDays(6)
      })
    ).toEqual({ state: "MOVING", duration_ms: 6 * 24 * 60 * 60 * 1000 });
  });

  it("marks STAGNANT at the exact limit — waiting the full budget is already late", () => {
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "OPEN",
        merged_into_opportunity_id: null,
        settings,
        now: atDays(DEFAULT_STAGNATION_DAYS)
      })
    ).toEqual({
      state: "STAGNANT",
      duration_ms: DEFAULT_STAGNATION_DAYS * 24 * 60 * 60 * 1000
    });
  });

  it("anchors at arrived_at when the lead has never moved, so the forgotten card is the most stagnant", () => {
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "OPEN",
        merged_into_opportunity_id: null,
        settings,
        now: atDays(9)
      }).state
    ).toBe("STAGNANT");
  });

  it("restarts the wait from last_movement_at, not from arrival", () => {
    const moved_at = atDays(8);
    expect(
      stagnation({
        arrived_at,
        last_movement_at: moved_at,
        status: "OPEN",
        merged_into_opportunity_id: null,
        settings,
        now: atDays(10)
      })
    ).toEqual({ state: "MOVING", duration_ms: 2 * 24 * 60 * 60 * 1000 });
  });

  it("uses the workspace's resolved limit, not the domain default, when they differ", () => {
    const tight: ResolvedWorkspaceSettings = {
      first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
      stagnation_days: 3
    };
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "OPEN",
        merged_into_opportunity_id: null,
        settings: tight,
        now: atDays(3)
      }).state
    ).toBe("STAGNANT");
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "OPEN",
        merged_into_opportunity_id: null,
        settings: tight,
        now: atDays(2)
      }).state
    ).toBe("MOVING");
  });

  it("never counts WON, LOST or a merged lead as stagnant", () => {
    const now = atDays(30);
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "WON",
        merged_into_opportunity_id: null,
        settings,
        now
      }).state
    ).toBe("MOVING");
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "LOST",
        merged_into_opportunity_id: null,
        settings,
        now
      }).state
    ).toBe("MOVING");
    expect(
      stagnation({
        arrived_at,
        last_movement_at: null,
        status: "OPEN",
        merged_into_opportunity_id: "33333333-3333-3333-3333-333333333333",
        settings,
        now
      }).state
    ).toBe("MOVING");
  });

  it("measures wall-clock days: a wait that spans a weekend still counts every hour", () => {
    const friday = new Date("2026-08-14T18:00:00.000Z");
    const nextMonday = new Date("2026-08-17T18:00:00.000Z");
    const result = stagnation({
      arrived_at: friday,
      last_movement_at: null,
      status: "OPEN",
      merged_into_opportunity_id: null,
      settings: { ...settings, stagnation_days: 2 },
      now: nextMonday
    });
    expect(result.duration_ms).toBe(3 * 24 * 60 * 60 * 1000);
    expect(result.state).toBe("STAGNANT");
  });
});
