import { MARKERS, type TableMarker } from "@marctco/domain";

const VALID_MARKERS: ReadonlySet<string> = new Set<TableMarker>(MARKERS);

/**
 * Parses the `marker` URL search param into a `TableMarker`, or `undefined` for
 * "no filter". Anything unrecognized — including a Fase-2 value this build
 * does not know yet — degrades to no filter rather than throwing, so an old
 * shared link never 500s the screen. SLA-breached and stagnant are markers,
 * not table filters: counting them is a different question (ADR-0018).
 */
export function parseMarkerFilter(value: string | null | undefined): TableMarker | undefined {
  if (value && VALID_MARKERS.has(value)) {
    return value as TableMarker;
  }
  return undefined;
}
