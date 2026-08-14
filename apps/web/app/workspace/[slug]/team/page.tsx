import { listTeam } from "@marctco/db";
import { notFound, redirect } from "next/navigation";
import { canManageTeam, canReadTeam } from "../../../../lib/team-access";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";
import { TeamView } from "./team-view";

interface TeamPageProps {
  readonly params: Promise<{ slug: string }>;
  readonly searchParams: Promise<{ edit?: string; error?: string; result?: string }>;
}

export default async function TeamPage({ params, searchParams }: TeamPageProps) {
  const [{ slug }, query] = await Promise.all([params, searchParams]);
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") redirect("/login");
  if (access.status === "not-found" || !canReadTeam(access.workspace.role)) notFound();

  const members = await listTeam(access.workspace.context);
  const editingMember = canManageTeam(access.workspace.role)
    ? members.find((member) => member.user_id === query.edit)
    : undefined;
  return (
    <TeamView
      actorUserId={access.workspace.context.user_id}
      canManage={canManageTeam(access.workspace.role)}
      editingMember={editingMember}
      members={members}
      result={query.result ?? query.error}
      role={access.workspace.role}
      slug={slug}
    />
  );
}
