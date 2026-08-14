import type { CollaboratorRole, WorkspaceRole } from "@marctco/db";

export const COLLABORATOR_ROLE_OPTIONS: ReadonlyArray<{
  readonly label: string;
  readonly value: CollaboratorRole;
}> = [
  { label: "Atendente", value: "ATTENDANT" },
  { label: "Supervisor", value: "SUPERVISOR" },
  { label: "Gestão", value: "MANAGER" }
];

export function canReadTeam(role: WorkspaceRole): boolean {
  return role === "SUPERVISOR" || role === "MANAGER" || role === "OWNER";
}

export function canManageTeam(role: WorkspaceRole): boolean {
  return role === "OWNER";
}
