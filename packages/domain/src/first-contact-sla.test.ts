import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  DEFAULT_STAGNATION_DAYS,
  type ResolvedWorkspaceSettings
} from "./workspace-settings.js";
import { firstContactSla } from "./first-contact-sla.js";

const settings: ResolvedWorkspaceSettings = {
  first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  stagnation_days: DEFAULT_STAGNATION_DAYS
};

const arrived_at = new Date("2026-08-17T12:00:00.000Z");

function atMinutes(minutes: number): Date {
  return new Date(arrived_at.getTime() + minutes * 60_000);
}

describe("firstContactSla", () => {
  it("keeps an open lead PENDING while the wait is still inside the limit", () => {
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: null,
        status: "OPEN",
        settings,
        now: atMinutes(119)
      })
    ).toEqual({ state: "PENDING", duration_ms: 119 * 60_000 });
  });

  it("breaches at the exact limit — waiting the full budget is already late", () => {
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: null,
        status: "OPEN",
        settings,
        now: atMinutes(DEFAULT_FIRST_CONTACT_SLA_MINUTES)
      })
    ).toEqual({ state: "BREACHED", duration_ms: DEFAULT_FIRST_CONTACT_SLA_MINUTES * 60_000 });
  });

  it("counts a first contact inside the limit as MET, with the wait frozen at that instant", () => {
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: atMinutes(45),
        status: "OPEN",
        settings,
        now: atMinutes(400)
      })
    ).toEqual({ state: "MET", duration_ms: 45 * 60_000 });
  });

  it("counts a late first contact as BREACHED, not as MET", () => {
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: atMinutes(180),
        status: "OPEN",
        settings,
        now: atMinutes(400)
      })
    ).toEqual({ state: "BREACHED", duration_ms: 180 * 60_000 });
  });

  it("uses the workspace's resolved limit, not the domain default, when they differ", () => {
    const tight: ResolvedWorkspaceSettings = {
      first_contact_sla_minutes: 30,
      stagnation_days: DEFAULT_STAGNATION_DAYS
    };
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: atMinutes(30),
        status: "OPEN",
        settings: tight,
        now: atMinutes(30)
      }).state
    ).toBe("BREACHED");
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: atMinutes(29),
        status: "OPEN",
        settings: tight,
        now: atMinutes(29)
      }).state
    ).toBe("MET");
  });

  it("does not count WON or LOST without contact as attended, even inside the limit", () => {
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: null,
        status: "WON",
        settings,
        now: atMinutes(30)
      })
    ).toEqual({ state: "PENDING", duration_ms: 30 * 60_000 });
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: null,
        status: "LOST",
        settings,
        now: atMinutes(30)
      }).state
    ).toBe("PENDING");
  });

  it("still marks a closed lead without contact BREACHED once the wait has passed the limit", () => {
    expect(
      firstContactSla({
        arrived_at,
        first_contact_at: null,
        status: "LOST",
        settings,
        now: atMinutes(180)
      }).state
    ).toBe("BREACHED");
  });

  it("measures wall-clock time: a wait that spans a night still counts every minute", () => {
    const evening = new Date("2026-08-17T22:00:00.000Z");
    const nextMorning = new Date("2026-08-18T10:00:00.000Z");
    const sla = firstContactSla({
      arrived_at: evening,
      first_contact_at: null,
      status: "OPEN",
      settings,
      now: nextMorning
    });
    expect(sla.duration_ms).toBe(12 * 60 * 60 * 1000);
    expect(sla.state).toBe("BREACHED");
  });
});
