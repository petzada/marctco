import { MARKERS, type Marker } from "@marctco/domain";

const VALID_MARKERS: ReadonlySet<string> = new Set<Marker>(MARKERS);

/**
 * Parses the `marker` URL search param into a `Marker`, or `undefined` for
 * "no filter". Anything unrecognized — including a Fase-2 value this build
 * does not know yet — degrades to no filter rather than throwing, so an old
 * shared link never 500s the screen.
 */
export function parseMarkerFilter(value: string | null | undefined): Marker | undefined {
  if (value && VALID_MARKERS.has(value)) {
    return value as Marker;
  }
  return undefined;
}
