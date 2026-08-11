import { notFound } from "next/navigation";
import { getLead } from "@marctco/db";
import { LeadCardContent } from "../../../../../../components/leads/lead-card-content";
import { LeadCardModalShell } from "../../../../../../components/leads/lead-card-modal-shell";
import { resolveWorkspaceAccess } from "../../../../../../lib/workspace-access";

/**
 * Intercepts a `Link` navigation to `/workspace/:slug/leads/:opportunityId`
 * from inside the Leads list and renders it as an overlay instead of a full
 * page swap — still a Server Component calling `getLead` directly, still no
 * endpoint for the read (ADR-0013). A hard refresh or a pasted link falls
 * through to the sibling `[opportunityId]/page.tsx` instead.
 */
export default async function LeadCardInterceptedModal({
  params
}: Readonly<{ params: Promise<{ slug: string; opportunityId: string }> }>) {
  const { slug, opportunityId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    notFound();
  }

  try {
    const lead = await getLead(access.workspace.context, opportunityId);
    return (
      <LeadCardModalShell>
        <LeadCardContent lead={lead} slug={slug} />
      </LeadCardModalShell>
    );
  } catch {
    notFound();
  }
}
