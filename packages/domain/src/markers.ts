import type { FirstContactSla } from "./first-contact-sla.js";
import type { Stagnation } from "./stagnation.js";

/**
 * The domain warnings that one UI entry point presents for a commercial
 * lead, in the fixed order `markersFor` emits them. `MARKERS` is the closed
 * list a filter or a counter iterates over — never re-typed as a literal
 * array at the call site, which is how a marker added here and forgotten
 * there stays invisible to every screen but this module.
 *
 * `FIRST_CONTACT_SLA_BREACHED` and `STAGNANT` are markers for "what this
 * lead has", not table-top counters: counting SLA or stagnation is a
 * different question (ADR-0018).
 */
export const MARKERS = ["MISSING_PHONE", "IDENTITY_CONFLICT", "POSSIBLE_DUPLICATE"] as const;
export type TableMarker = (typeof MARKERS)[number];
export type Marker = TableMarker | "FIRST_CONTACT_SLA_BREACHED" | "STAGNANT";

export interface MarkerOpportunity {
  /** Means one thing only: there is no phone call or WhatsApp path. */
  readonly missing_phone: boolean;
}

export interface MarkerReview {
  readonly type: "IDENTITY_CONFLICT" | "POSSIBLE_DUPLICATE";
}

/**
 * Answers "what does this lead have?" from data the scoped reader already
 * loaded. Criteria and order belong to the domain; labels and icons belong to
 * the UI. Multiple reviews of one type still produce one marker entry.
 *
 * The SLA and stagnation states come from `firstContactSla` and
 * `stagnation` — the same functions the listing and the later sweep call —
 * so the icon and the alert cannot disagree.
 */
export function markersFor(
  opportunity: MarkerOpportunity,
  reviews: readonly MarkerReview[],
  sla?: FirstContactSla,
  stagnationState?: Stagnation
): readonly Marker[] {
  const review_types = new Set(reviews.map((review) => review.type));
  const markers: Marker[] = [];

  if (opportunity.missing_phone) {
    markers.push("MISSING_PHONE");
  }
  if (review_types.has("IDENTITY_CONFLICT")) {
    markers.push("IDENTITY_CONFLICT");
  }
  if (review_types.has("POSSIBLE_DUPLICATE")) {
    markers.push("POSSIBLE_DUPLICATE");
  }
  if (sla?.state === "BREACHED") {
    markers.push("FIRST_CONTACT_SLA_BREACHED");
  }
  if (stagnationState?.state === "STAGNANT") {
    markers.push("STAGNANT");
  }

  return markers;
}
