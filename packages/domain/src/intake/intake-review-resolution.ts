/** The three audit-safe outcomes available for a possible duplicate. */
export const POSSIBLE_DUPLICATE_RESOLUTIONS = [
  "NEW_FINANCING",
  "SAME_FINANCING",
  "INVALID_OR_SPAM"
] as const;

export type PossibleDuplicateResolution =
  (typeof POSSIBLE_DUPLICATE_RESOLUTIONS)[number];

export interface PlanPossibleDuplicateResolutionInput {
  /** The newer card on which the review was created. */
  readonly opportunity_id: string;
  /** The open card that already existed when the newer card arrived. */
  readonly related_opportunity_id: string;
  readonly resolution: PossibleDuplicateResolution;
  readonly resolved_by_user_id: string;
  readonly resolved_at: Date;
  readonly reason: string;
}

interface ResolutionAudit {
  readonly resolved_by_user_id: string;
  readonly resolved_at: Date;
  readonly reason: string;
}

/**
 * A possible-duplicate decision described as data before the database applies
 * it. Every variant carries the audit facts, so no resolution can accidentally
 * become destructive or anonymous.
 */
export type PossibleDuplicateResolutionPlan =
  | (ResolutionAudit & {
      readonly kind: "NEW_FINANCING";
      readonly opportunity_id: string;
      readonly related_opportunity_id: string;
    })
  | (ResolutionAudit & {
      readonly kind: "SAME_FINANCING";
      readonly absorbed_opportunity_id: string;
      readonly canonical_opportunity_id: string;
    })
  | (ResolutionAudit & {
      readonly kind: "INVALID_OR_SPAM";
      readonly opportunity_id: string;
      readonly related_opportunity_id: string;
    });

export function planPossibleDuplicateResolution(
  input: PlanPossibleDuplicateResolutionInput
): PossibleDuplicateResolutionPlan {
  const reason = input.reason.trim();
  if (reason.length === 0) {
    throw new Error("A possible-duplicate resolution reason is required");
  }

  const audit = {
    resolved_by_user_id: input.resolved_by_user_id,
    resolved_at: input.resolved_at,
    reason
  } as const;

  switch (input.resolution) {
    case "NEW_FINANCING":
      return {
        kind: input.resolution,
        opportunity_id: input.opportunity_id,
        related_opportunity_id: input.related_opportunity_id,
        ...audit
      };
    case "SAME_FINANCING":
      return {
        kind: input.resolution,
        absorbed_opportunity_id: input.opportunity_id,
        canonical_opportunity_id: input.related_opportunity_id,
        ...audit
      };
    case "INVALID_OR_SPAM":
      return {
        kind: input.resolution,
        opportunity_id: input.opportunity_id,
        related_opportunity_id: input.related_opportunity_id,
        ...audit
      };
    default: {
      const unhandled: never = input.resolution;
      throw new Error(`Unhandled possible-duplicate resolution: ${String(unhandled)}`);
    }
  }
}
