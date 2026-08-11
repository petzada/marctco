import { createSearchParamsCache, parseAsString, parseAsStringLiteral } from "nuqs/server";
import { MARKERS } from "@marctco/domain";

/**
 * Filter, cursor and active marker live in the URL via `nuqs` (ticket 12
 * acceptance criterion): every view of the Leads screen becomes a link the
 * gestor can share with the team. Parsed once, on the server, so the Server
 * Component never builds an ad hoc query out of raw `searchParams`.
 */
export const leadsSearchParams = {
  cursor: parseAsString,
  marker: parseAsStringLiteral(MARKERS)
};

export const leadsSearchParamsCache = createSearchParamsCache(leadsSearchParams);
