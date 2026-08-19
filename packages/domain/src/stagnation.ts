import type { ResolvedWorkspaceSettings } from "./workspace-settings.js";

export const STAGNATION_STATES = ["MOVING", "STAGNANT"] as const;
export type StagnationState = (typeof STAGNATION_STATES)[number];

export type StagnationOpportunityStatus = "OPEN" | "WON" | "LOST";

export interface Stagnation {
  readonly state: StagnationState;
  readonly duration_ms: number;
}

export interface StagnationInput {
  readonly arrived_at: Date;
  readonly last_movement_at: Date | null;
  readonly status: StagnationOpportunityStatus;
  readonly merged_into_opportunity_id: string | null;
  readonly settings: ResolvedWorkspaceSettings;
  readonly now: Date;
}

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * The only function that answers whether a lead is stagnant. Listing and
 * the later sweep call this same one so the screen and the alert cannot
 * disagree.
 *
 * The clock measures movement, not arrival. When the lead has never been
 * moved, the wait anchors at `arrived_at` — that is how the most forgotten
 * card is the most stagnant, not the least. Waiting the full budget
 * (`duration_ms === limit`) is already stagnant. `WON`, `LOST` and merged
 * leads never count as stagnant.
 */
export function stagnation(input: StagnationInput): Stagnation {
  const anchor = input.last_movement_at ?? input.arrived_at;
  const duration_ms = Math.max(0, input.now.getTime() - anchor.getTime());
  if (input.status === "WON" || input.status === "LOST" || input.merged_into_opportunity_id !== null) {
    return { state: "MOVING", duration_ms };
  }
  const limit_ms = input.settings.stagnation_days * MS_PER_DAY;
  return {
    state: duration_ms >= limit_ms ? "STAGNANT" : "MOVING",
    duration_ms
  };
}
