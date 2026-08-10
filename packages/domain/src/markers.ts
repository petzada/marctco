/** The domain warnings that one UI entry point presents for a commercial lead. */
export type Marker = "MISSING_PHONE" | "IDENTITY_CONFLICT" | "POSSIBLE_DUPLICATE";

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
 */
export function markersFor(
  opportunity: MarkerOpportunity,
  reviews: readonly MarkerReview[]
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

  return markers;
}
