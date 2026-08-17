import { notFound, redirect } from "next/navigation";
import { resolveWorkspaceAccess } from "../../../lib/workspace-access";
import { workspaceRoleLabel } from "../../../lib/workspace-role";
import { canReadTeam } from "../../../lib/team-access";
import { attendsLeads } from "../../../lib/lead-board-access";
import { WorkspaceShell } from "./workspace-shell";

export default async function WorkspaceLayout({
  children,
  params
}: Readonly<{ children: React.ReactNode; params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    redirect("/login");
  }
  if (access.status === "not-found") {
    notFound();
  }

  return (
    <WorkspaceShell
      attendsLeads={attendsLeads(access.workspace.role)}
      canReadTeam={canReadTeam(access.workspace.role)}
      canManageIntegrations={
        access.workspace.role === "MANAGER" || access.workspace.role === "OWNER"
      }
      roleLabel={workspaceRoleLabel(access.workspace.role)}
      slug={slug}
      workspaceName={access.workspace.name}
    >
      {children}
    </WorkspaceShell>
  );
}
