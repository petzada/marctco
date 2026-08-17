import type { ResolvedWorkspaceSettings } from "./workspace-settings.js";

export const FIRST_CONTACT_SLA_STATES = ["PENDING", "MET", "BREACHED"] as const;
export type FirstContactSlaState = (typeof FIRST_CONTACT_SLA_STATES)[number];

export type FirstContactSlaOpportunityStatus = "OPEN" | "WON" | "LOST";

export interface FirstContactSla {
  readonly state: FirstContactSlaState;
  readonly duration_ms: number;
}

export interface FirstContactSlaInput {
  readonly arrived_at: Date;
  readonly first_contact_at: Date | null;
  readonly status: FirstContactSlaOpportunityStatus;
  readonly settings: ResolvedWorkspaceSettings;
  readonly now: Date;
}

/**
 * The only function that answers a lead's first-contact SLA. Listing and
 * the later sweep call this same one so the screen and the alert cannot
 * disagree.
 *
 * The clock is wall-clock on purpose: there is no per-workspace business
 * calendar yet, and assuming 09:00–18:00 would lie about the lead that
 * arrives at 19:00 from an ad — exactly the case this clock exists to
 * catch. Recorded as an open item of the construction plan; do not paper
 * over it here.
 *
 * Waiting the full budget (`duration_ms === limit`) is already late. A
 * `WON`/`LOST` lead with no completed activity never counts as attended
 * (`MET`). CONTEXT requires the wait to stop when the lead closes, but the
 * inputs listed in the Fase 3 spec carry no close instant — only
 * `first_contact_at` or `now`. Until that instant is decided, duration for
 * closed leads without contact still ends at `now` (see ticket 03 review).
 */
export function firstContactSla(input: FirstContactSlaInput): FirstContactSla {
  const end = input.first_contact_at ?? input.now;
  const duration_ms = Math.max(0, end.getTime() - input.arrived_at.getTime());
  const limit_ms = input.settings.first_contact_sla_minutes * 60_000;
  const over_limit = duration_ms >= limit_ms;

  if (input.first_contact_at !== null) {
    return { state: over_limit ? "BREACHED" : "MET", duration_ms };
  }

  // WON/LOST without contact is never MET (CONTEXT). Duration freeze pending
  // a decided close instant — see module comment above.
  if (input.status === "WON" || input.status === "LOST") {
    return { state: over_limit ? "BREACHED" : "PENDING", duration_ms };
  }

  return { state: over_limit ? "BREACHED" : "PENDING", duration_ms };
}
