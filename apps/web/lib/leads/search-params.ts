import { createSearchParamsCache, parseAsString, parseAsStringLiteral } from "nuqs/server";
import { LEAD_CLOCK_FILTERS, MARKERS } from "@marctco/domain";

/**
 * Filter, cursor and active marker live in the URL via `nuqs` (ticket 12
 * acceptance criterion): every view of the Leads screen becomes a link the
 * gestor can share with the team. Parsed once, on the server, so the Server
 * Component never builds an ad hoc query out of raw `searchParams`.
 */
export const leadsSearchParams = {
  cursor: parseAsString,
  marker: parseAsStringLiteral(MARKERS),
  clock: parseAsStringLiteral(LEAD_CLOCK_FILTERS),
  responsible: parseAsString,
  team: parseAsString
};

export const leadsSearchParamsCache = createSearchParamsCache(leadsSearchParams);

/**
 * Which half of the Meus leads toggle is open (ticket 07). Parsed the same
 * way, on the server, so the board a person is looking at is a link they can
 * send — and so the value is a known literal instead of whatever the URL said.
 */
export const BOARD_VIEWS = ["kanban", "list"] as const;

export const boardSearchParamsCache = createSearchParamsCache({
  view: parseAsStringLiteral(BOARD_VIEWS).withDefault("kanban")
});
