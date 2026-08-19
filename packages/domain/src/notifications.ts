import { firstContactSla } from "./first-contact-sla.js";
import { stagnation } from "./stagnation.js";
import type { ResolvedWorkspaceSettings } from "./workspace-settings.js";

export const NOTIFICATION_TYPES = ["FIRST_CONTACT_SLA_BREACHED", "STAGNANT"] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

const MANAGEMENT_ACTORS = new Set(["SUPERVISOR", "MANAGER", "OWNER"]);

/**
 * Gestão notifications are for Supervisor (team), Gestão and Direção.
 * Atendente is refused: the overdue activity on the Agenda is their signal.
 */
export function canActOnManagementNotifications(role: string): boolean {
  return MANAGEMENT_ACTORS.has(role);
}

export interface ClockNotificationOpportunity {
  readonly arrived_at: Date;
  readonly first_contact_at: Date | null;
  readonly closed_at: Date | null;
  readonly last_movement_at: Date | null;
  readonly status: "OPEN" | "WON" | "LOST";
  readonly merged_into_opportunity_id: string | null;
}

/**
 * Which management notifications this lead should carry right now. Uses the
 * same `firstContactSla` / `stagnation` the listing and markers call, so the
 * screen and the alert cannot disagree.
 *
 * SLA breach is only notified while the lead is still waiting: first contact
 * ends the cause even when attendance was late. Closed and merged leads
 * never keep an active notification.
 */
export function clockNotificationTypes(
  opportunity: ClockNotificationOpportunity,
  settings: ResolvedWorkspaceSettings,
  now: Date
): readonly NotificationType[] {
  const types: NotificationType[] = [];
  const sla = firstContactSla({
    arrived_at: opportunity.arrived_at,
    first_contact_at: opportunity.first_contact_at,
    closed_at: opportunity.closed_at,
    status: opportunity.status,
    settings,
    now
  });
  if (
    opportunity.status === "OPEN" &&
    opportunity.merged_into_opportunity_id === null &&
    opportunity.first_contact_at === null &&
    sla.state === "BREACHED"
  ) {
    types.push("FIRST_CONTACT_SLA_BREACHED");
  }
  if (
    stagnation({
      arrived_at: opportunity.arrived_at,
      last_movement_at: opportunity.last_movement_at,
      status: opportunity.status,
      merged_into_opportunity_id: opportunity.merged_into_opportunity_id,
      settings,
      now
    }).state === "STAGNANT"
  ) {
    types.push("STAGNANT");
  }
  return types;
}
