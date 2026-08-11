import Link from "next/link";
import { MARKERS, type Marker } from "@marctco/domain";
import type { LeadMarkerCounts } from "@marctco/db";
import { StatusBadge, type StatusBadgeTone } from "../ui/status-badge";
import { markerPresentation } from "../../lib/leads/markers";

export interface MarkerCountersProps {
  readonly counts: LeadMarkerCounts;
  readonly activeMarker: Marker | undefined;
  readonly slug: string;
}

const TONE_BY_MARKER: Readonly<Record<Marker, StatusBadgeTone>> = {
  MISSING_PHONE: "warning",
  IDENTITY_CONFLICT: "danger",
  POSSIBLE_DUPLICATE: "info"
};

/**
 * "Quais leads têm este aviso" — counted over the partial index
 * (`countLeadsByMarker`), never over `markersFor` on the loaded page
 * (ADR-0018). Clicking a counter filters the table in place, in the same
 * pattern for every marker including "sem telefone" (ticket 12).
 */
export function MarkerCounters({ counts, activeMarker, slug }: MarkerCountersProps) {
  return (
    <div aria-label="Filtrar por aviso" className="flex flex-wrap items-center gap-xs" role="group">
      {MARKERS.map((marker) => {
        const active = activeMarker === marker;
        const href = active ? `/workspace/${slug}/leads` : `/workspace/${slug}/leads?marker=${marker}`;
        return (
          <Link
            aria-pressed={active}
            className={`rounded-pill focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus ${
              active ? "outline outline-2 outline-primary" : ""
            }`.trim()}
            href={href}
            key={marker}
          >
            <StatusBadge dot tone={TONE_BY_MARKER[marker]}>
              {markerPresentation(marker).label} · {counts[marker]}
            </StatusBadge>
          </Link>
        );
      })}
    </div>
  );
}
