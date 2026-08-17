import type { WorkspaceRole } from "@marctco/db";

/**
 * Who has a "Meus leads" board. `ATTENDANT` conducts their own day and
 * `SUPERVISOR` the team's; Gestão and Direção distribute and follow along in
 * the Leads table, which already shows them everything the board would.
 *
 * The absence of the nav item for those two is **not** an access refusal — it
 * is an absence of scope, which is why the route redirects them to Leads
 * instead of 404-ing (ADR-0015, ADR-0024, and `decisao-features-concorrentes.md`
 * §4, which turned down a global Kanban).
 */
export function attendsLeads(role: WorkspaceRole): boolean {
  return role === "ATTENDANT" || role === "SUPERVISOR";
}
