import type { OperationalDashboardDestination, OperationalDashboardTile } from "@marctco/domain";

export function dashboardLeadHref(slug: string, opportunity_id: string): string {
  return `/workspace/${slug}/leads/${opportunity_id}`;
}

/**
 * Turns the named operation's destination into a shareable URL under this
 * workspace. The filter lives in the query string so Leads and Agenda open
 * already pointing at the burning set.
 */
export function operationalDashboardHref(
  slug: string,
  destination: OperationalDashboardDestination
): string {
  const params = new URLSearchParams(destination.query);
  const encoded = params.toString();
  return `/workspace/${slug}/${destination.screen}${encoded ? `?${encoded}` : ""}`;
}

export function dashboardTileHref(slug: string, tile: OperationalDashboardTile): string {
  return operationalDashboardHref(slug, tile.destination);
}
