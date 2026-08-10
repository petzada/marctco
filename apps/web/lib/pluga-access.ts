import type { WorkspaceRole } from "@marctco/db";

/**
 * ADR-0015's split for the Pluga screen: "gerar/rotacionar segredo,
 * ativar/desativar" are exclusive to Direção; "histórico, reprocessar e
 * quarentena" are Gestão and up. Kept as two named functions rather than one
 * boolean-returning check so a call site cannot accidentally gate the wrong
 * half of the screen with the wrong rule.
 */

export function canOpenPlugaScreen(role: WorkspaceRole): boolean {
  return role === "MANAGER" || role === "OWNER";
}

export function canManageIntegrationSecret(role: WorkspaceRole): boolean {
  return role === "OWNER";
}

export function canOperateIntegrations(role: WorkspaceRole): boolean {
  return role === "MANAGER" || role === "OWNER";
}
