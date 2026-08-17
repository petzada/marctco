import { notFound } from "next/navigation";
import { getLead, getWorkspaceSettings, listLeadActivities, listTeam } from "@marctco/db";
import { LeadCardContent } from "../../../../../../components/leads/lead-card-content";
import { LeadCardModalShell } from "../../../../../../components/leads/lead-card-modal-shell";
import { resolveWorkspaceAccess } from "../../../../../../lib/workspace-access";

/**
 * Intercepts a `Link` navigation to `/workspace/:slug/leads/:opportunityId`
 * from inside the Leads list and renders it as an overlay instead of a full
 * page swap — still a Server Component calling named operations directly,
 * still no endpoint for the read (ADR-0013).
 */
export default async function LeadCardInterceptedModal({
  params
}: Readonly<{ params: Promise<{ slug: string; opportunityId: string }> }>) {
  const { slug, opportunityId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    notFound();
  }

  const context = access.workspace.context;
  try {
    const [lead, activities, teammates, clockSettings] = await Promise.all([
      getLead(context, opportunityId),
      listLeadActivities(context, opportunityId),
      context.role === "ATTENDANT" ? Promise.resolve([]) : listTeam(context),
      getWorkspaceSettings(context)
    ]);
    return (
      <LeadCardModalShell>
        <LeadCardContent
          activities={activities}
          assignees={teammates.map((member) => ({
            user_id: member.user_id,
            display_name: member.display_name?.trim() || member.email || "Sem nome"
          }))}
          clockSettings={clockSettings}
          currentUserId={context.user_id}
          lead={lead}
          nowIso={new Date().toISOString()}
          slug={slug}
        />
      </LeadCardModalShell>
    );
  } catch {
    notFound();
  }
}
