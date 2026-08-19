import { describe, expect, it } from "vitest";
import {
  DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  DEFAULT_STAGNATION_DAYS,
  type ResolvedWorkspaceSettings
} from "./workspace-settings.js";
import {
  canActOnManagementNotifications,
  clockNotificationTypes,
  type ClockNotificationOpportunity
} from "./notifications.js";

const settings: ResolvedWorkspaceSettings = {
  first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  stagnation_days: DEFAULT_STAGNATION_DAYS
};

const arrived_at = new Date("2026-08-17T12:00:00.000Z");

function openLead(
  overrides: Partial<ClockNotificationOpportunity> = {}
): ClockNotificationOpportunity {
  return {
    arrived_at,
    first_contact_at: null,
    closed_at: null,
    last_movement_at: arrived_at,
    status: "OPEN",
    merged_into_opportunity_id: null,
    ...overrides
  };
}

function atMinutes(minutes: number): Date {
  return new Date(arrived_at.getTime() + minutes * 60_000);
}

function atDays(days: number): Date {
  return new Date(arrived_at.getTime() + days * 24 * 60 * 60 * 1000);
}

describe("canActOnManagementNotifications", () => {
  it("allows Supervisor, Gestão and Direção, and refuses Atendente", () => {
    expect(canActOnManagementNotifications("SUPERVISOR")).toBe(true);
    expect(canActOnManagementNotifications("MANAGER")).toBe(true);
    expect(canActOnManagementNotifications("OWNER")).toBe(true);
    expect(canActOnManagementNotifications("ATTENDANT")).toBe(false);
  });
});

describe("clockNotificationTypes", () => {
  it("notifies first-contact SLA only after the waiting lead is late", () => {
    expect(clockNotificationTypes(openLead(), settings, atMinutes(119))).toEqual([]);
    expect(clockNotificationTypes(openLead(), settings, atMinutes(120))).toEqual([
      "FIRST_CONTACT_SLA_BREACHED"
    ]);
  });

  it("stops notifying SLA once first contact happened, even when attendance was late", () => {
    expect(
      clockNotificationTypes(
        openLead({ first_contact_at: atMinutes(180) }),
        settings,
        atMinutes(200)
      )
    ).toEqual([]);
  });

  it("notifies stagnation on an open lead that has not moved past the limit", () => {
    const contacted = openLead({ first_contact_at: atMinutes(10) });
    expect(clockNotificationTypes(contacted, settings, atDays(6))).toEqual([]);
    expect(clockNotificationTypes(contacted, settings, atDays(7))).toEqual(["STAGNANT"]);
  });

  it("can carry both clocks on the same forgotten lead", () => {
    expect(clockNotificationTypes(openLead(), settings, atDays(7))).toEqual([
      "FIRST_CONTACT_SLA_BREACHED",
      "STAGNANT"
    ]);
  });

  it("never notifies a closed or merged lead", () => {
    const now = atDays(7);
    expect(
      clockNotificationTypes(
        openLead({ status: "WON", closed_at: atMinutes(10) }),
        settings,
        now
      )
    ).toEqual([]);
    expect(
      clockNotificationTypes(
        openLead({ status: "LOST", closed_at: atMinutes(10) }),
        settings,
        now
      )
    ).toEqual([]);
    expect(
      clockNotificationTypes(
        openLead({ merged_into_opportunity_id: "11111111-1111-1111-8111-111111111111" }),
        settings,
        now
      )
    ).toEqual([]);
  });
});
