import type { FirstContactTrigger } from "./first-contact.js";

/**
 * The complete MVP catalog. Keep it server-side: it describes paid roadmap
 * capabilities, while a browser only needs the boolean already resolved for
 * its current workspace (ADR-0004).
 */
export const FEATURE_FLAGS = [
  "auto_primeiro_contato",
  "score_cabimento_llm",
  "resumo_handoff_llm"
] as const;

export type FeatureFlag = (typeof FEATURE_FLAGS)[number];
export type ResolvedFeatureFlags = Readonly<Record<FeatureFlag, boolean>>;

const featureFlagSet: ReadonlySet<string> = new Set(FEATURE_FLAGS);

export function isFeatureFlag(value: string): value is FeatureFlag {
  return featureFlagSet.has(value);
}

/** Turns database presence into a complete, fail-closed workspace result. */
export function resolveFeatureFlags(enabled_keys: Iterable<string>): ResolvedFeatureFlags {
  const enabled = new Set(Array.from(enabled_keys).filter(isFeatureFlag));
  return Object.freeze(
    Object.fromEntries(FEATURE_FLAGS.map((key) => [key, enabled.has(key)]))
  ) as ResolvedFeatureFlags;
}

export interface AutoFirstContactEffect {
  readonly kind: "AUTO_FIRST_CONTACT";
  readonly opportunity_id: string;
}

export type OpportunityPostCreationEffect = AutoFirstContactEffect;

/**
 * Arrival-hook planner. The default trigger is ON_ASSIGNMENT, so this only
 * emits AUTO_FIRST_CONTACT when the workspace explicitly chose ON_ARRIVAL.
 * A missing created Opportunity emits nothing. Opt-in and eligibility live
 * in `planFirstContactDispatch`; this function does not duplicate them.
 */
export function planOpportunityPostCreationEffects(input: {
  readonly feature_flags: ResolvedFeatureFlags;
  readonly first_contact_trigger: FirstContactTrigger;
  readonly created_opportunity_id: string | null;
}): readonly OpportunityPostCreationEffect[] {
  if (
    input.created_opportunity_id === null ||
    !input.feature_flags.auto_primeiro_contato ||
    input.first_contact_trigger !== "ON_ARRIVAL"
  ) {
    return [];
  }
  return [
    {
      kind: "AUTO_FIRST_CONTACT",
      opportunity_id: input.created_opportunity_id
    }
  ];
}
