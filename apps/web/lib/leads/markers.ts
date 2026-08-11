import type { Marker } from "@marctco/domain";

/**
 * PT-BR label and icon key for a marker. Order and criteria are the
 * domain's (`markersFor`, ADR-0018); this is only the presentation half.
 *
 * The `switch` below is exhaustive on purpose: adding a marker variant in
 * Fase 2 without a branch here is a compile error, not a runtime surprise
 * (ticket 12 acceptance criterion, ADR-0018).
 */
export interface MarkerPresentation {
  readonly label: string;
  readonly icon: "phone-off" | "user-question" | "copy";
}

export function markerPresentation(marker: Marker): MarkerPresentation {
  switch (marker) {
    case "MISSING_PHONE":
      return { label: "Sem telefone", icon: "phone-off" };
    case "IDENTITY_CONFLICT":
      return { label: "Identidade em conflito", icon: "user-question" };
    case "POSSIBLE_DUPLICATE":
      return { label: "Possível duplicado", icon: "copy" };
    default: {
      const unhandled: never = marker;
      throw new Error(`Unhandled marker: ${JSON.stringify(unhandled)}`);
    }
  }
}
