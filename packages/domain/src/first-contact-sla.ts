import type { ResolvedWorkspaceSettings } from "./workspace-settings.js";

export const FIRST_CONTACT_SLA_STATES = ["PENDING", "MET", "BREACHED"] as const;
export type FirstContactSlaState = (typeof FIRST_CONTACT_SLA_STATES)[number];

export type FirstContactSlaOpportunityStatus = "OPEN" | "WON" | "LOST";

export type FirstContactSlaRefusal = "CLOSED_WITHOUT_CLOSED_AT";

export class FirstContactSlaError extends Error {
  constructor(readonly reason: FirstContactSlaRefusal) {
    super(reason);
    this.name = "FirstContactSlaError";
  }
}

export interface FirstContactSla {
  readonly state: FirstContactSlaState;
  readonly duration_ms: number;
}

export interface FirstContactSlaInput {
  readonly arrived_at: Date;
  readonly first_contact_at: Date | null;
  readonly closed_at: Date | null;
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
 * Duration ends at `first_contact_at` when attendance happened, at
 * `closed_at` when the lead is `WON`/`LOST` without contact, or at `now`
 * while still `OPEN` without contact. Waiting the full budget
 * (`duration_ms === limit`) is already late. A `WON`/`LOST` lead with no
 * completed activity never counts as attended (`MET`).
 */
export function firstContactSla(input: FirstContactSlaInput): FirstContactSla {
  const end = waitEnd(input);
  const duration_ms = Math.max(0, end.getTime() - input.arrived_at.getTime());
  const limit_ms = input.settings.first_contact_sla_minutes * 60_000;
  const over_limit = duration_ms >= limit_ms;

  if (input.first_contact_at !== null) {
    return { state: over_limit ? "BREACHED" : "MET", duration_ms };
  }

  if (input.status === "WON" || input.status === "LOST") {
    return { state: over_limit ? "BREACHED" : "PENDING", duration_ms };
  }

  return { state: over_limit ? "BREACHED" : "PENDING", duration_ms };
}

function waitEnd(input: FirstContactSlaInput): Date {
  if (input.first_contact_at !== null) {
    return input.first_contact_at;
  }
  if (input.status === "OPEN") {
    return input.now;
  }
  if (input.closed_at === null) {
    throw new FirstContactSlaError("CLOSED_WITHOUT_CLOSED_AT");
  }
  return input.closed_at;
}
