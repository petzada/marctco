import type { LeadListCursor } from "@marctco/db";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The keyset cursor lives in the URL (ADR-0013, nuqs) as a single opaque
 * query-string value: `<ISO instant>_<uuid>`. `arrived_at` never contains
 * `_`, so a single `lastIndexOf` split is unambiguous.
 */
export function encodeLeadCursor(cursor: LeadListCursor): string {
  return `${cursor.arrived_at.toISOString()}_${cursor.id}`;
}

/**
 * Never throws: a malformed or tampered cursor decodes to `undefined`, which
 * `listLeads` reads as "first page" rather than the screen crashing on a
 * hand-edited URL.
 */
export function decodeLeadCursor(value: string | null | undefined): LeadListCursor | undefined {
  if (!value) {
    return undefined;
  }
  const separator = value.lastIndexOf("_");
  if (separator === -1) {
    return undefined;
  }
  const id = value.slice(separator + 1);
  if (!UUID_PATTERN.test(id)) {
    return undefined;
  }
  const arrived_at = new Date(value.slice(0, separator));
  if (Number.isNaN(arrived_at.getTime())) {
    return undefined;
  }
  return { arrived_at, id };
}
