import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLead, getLeadWhatsAppConnectionIndicator, getWorkspaceSettings, listLeadActivities, listLeadTimeline, listTeam } from "@marctco/db";
import { LeadCardContent } from "../../../../../components/leads/lead-card-content";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

export const metadata: Metadata = { title: "Lead | marctco" };

/**
 * The direct-navigation / shared-link / hard-refresh fallback for a single
 * lead — same named-operation reads as the intercepted modal, rendered
 * full-page instead of as an overlay.
 */
export default async function LeadCardPage({
  params
}: Readonly<{ params: Promise<{ slug: string; opportunityId: string }> }>) {
  const { slug, opportunityId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    notFound();
  }

  const context = access.workspace.context;
  try {
    const [lead, activities, timeline, teammates, clockSettings, whatsapp] = await Promise.all([
      getLead(context, opportunityId),
      listLeadActivities(context, opportunityId),
      listLeadTimeline(context, opportunityId),
      context.role === "ATTENDANT" ? Promise.resolve([]) : listTeam(context),
      getWorkspaceSettings(context),
      getLeadWhatsAppConnectionIndicator(context, opportunityId)
    ]);
    return (
      <main className="min-h-[100dvh] bg-canvas px-md py-lg md:px-lg md:py-xl">
        <div className="mx-auto w-full max-w-content">
          <Link className="text-body-sm text-primary hover:underline" href={`/workspace/${slug}/leads`}>
            ← Leads
          </Link>
          <div className="mt-md rounded-xl border border-hairline bg-canvas p-lg md:p-xl">
            <LeadCardContent
              activities={activities}
              timeline={timeline}
              assignees={teammates.map((member) => ({
                user_id: member.user_id,
                display_name: member.display_name?.trim() || member.email || "Sem nome"
              }))}
              clockSettings={clockSettings}
              currentUserId={context.user_id}
              lead={lead}
              nowIso={new Date().toISOString()}
              slug={slug}
              whatsappConnected={whatsapp.connected}
            />
          </div>
        </div>
      </main>
    );
  } catch {
    notFound();
  }
}
