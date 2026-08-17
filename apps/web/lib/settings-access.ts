import type { WorkspaceRole } from "@marctco/db";

/**
 * ADR-0015: Configurações (SLA, and later template WA / funnel editor) is
 * Gestão and Direção. The route refuses the other two itself; hiding the
 * nav item is cosmetic.
 */
export function canManageSettings(role: WorkspaceRole): boolean {
  return role === "MANAGER" || role === "OWNER";
}
