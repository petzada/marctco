import type { WorkspaceRole } from "@marctco/db";

const labels: Readonly<Record<WorkspaceRole, string>> = {
  ATTENDANT: "Atendente",
  SUPERVISOR: "Supervisor",
  MANAGER: "Gestão",
  OWNER: "Direção"
};

export function workspaceRoleLabel(role: WorkspaceRole): string {
  return labels[role];
}
