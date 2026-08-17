import type { WorkspaceRole } from "@marctco/db";

/**
 * Who has a "Meus leads" board. `ATTENDANT` and `SUPERVISOR` attend;
 * Gestão and Direção distribute in the Leads table.
 *
 * The absence of the nav item for those two is **not** an access refusal — it
 * is an absence of scope, which is why the route redirects them to Leads
 * instead of 404-ing (ADR-0015, ADR-0024, and `decisao-features-concorrentes.md`
 * §4, which turned down a global Kanban).
 */
export function attendsLeads(role: WorkspaceRole): boolean {
  return role === "ATTENDANT" || role === "SUPERVISOR";
}

/**
 * Who has the Leads table. The ATTENDANT does not: Meus leads already shows
 * their whole set (Kanban and list). The table is how Supervisor, Gestão and
 * Direção distribute and follow the team — the mirror of `attendsLeads`.
 *
 * The route redirects the ATTENDANT to Meus leads instead of 404-ing. Same
 * "absence of scope, not a block" as Gestão on the board (ADR-0015).
 */
export function seesLeadsTable(role: WorkspaceRole): boolean {
  return role !== "ATTENDANT";
}
