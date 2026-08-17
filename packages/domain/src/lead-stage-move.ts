export type StageMoveStatus = "OPEN" | "WON" | "LOST";

export interface StageMoveOpportunity {
  readonly status: StageMoveStatus;
  readonly pipeline_id: string;
  readonly stage_id: string;
  readonly merged_into_opportunity_id: string | null;
}

export interface StageMoveDestination {
  readonly stage_id: string;
  readonly pipeline_id: string;
}

export type StageMoveDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason:
        | "OPPORTUNITY_CLOSED"
        | "OPPORTUNITY_MERGED"
        | "DESTINATION_OUTSIDE_PIPELINE";
    };

/**
 * "É esta etapa móvel?" — the whole combinatorics of a drag, with no database
 * and no card in it. Ganho e perda leave the board (ADR-0009 §status), a
 * merged card is a tombstone (ADR-0007), and a stage of another pipeline is
 * not a destination — the commercial board never drops into the legal funnel.
 *
 * The decision alone never authorizes the write: `moveLeadStage` repeats the
 * same three facts as conditions in the `WHERE`, because two concurrent drags
 * are arbitrated by the database and not by whichever read came first
 * (ADR-0013).
 */
export function decideLeadStageMove(input: Readonly<{
  opportunity: StageMoveOpportunity;
  destination: StageMoveDestination;
}>): StageMoveDecision {
  if (input.opportunity.merged_into_opportunity_id !== null) {
    return { allowed: false, reason: "OPPORTUNITY_MERGED" };
  }
  if (input.opportunity.status !== "OPEN") {
    return { allowed: false, reason: "OPPORTUNITY_CLOSED" };
  }
  if (input.destination.pipeline_id !== input.opportunity.pipeline_id) {
    return { allowed: false, reason: "DESTINATION_OUTSIDE_PIPELINE" };
  }
  return { allowed: true };
}
