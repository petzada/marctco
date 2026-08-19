import type { WorkspaceRole } from "@marctco/db";
import { canReadOperationalDashboard } from "@marctco/domain";

/**
 * Who has the operational Dashboard. Atendente is refused by the route
 * itself; hiding the nav item is cosmetic (ADR-0015).
 */
export function canReadDashboard(role: WorkspaceRole): boolean {
  return canReadOperationalDashboard(role);
}
