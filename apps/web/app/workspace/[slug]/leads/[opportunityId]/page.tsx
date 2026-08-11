import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getLead } from "@marctco/db";
import { LeadCardContent } from "../../../../../components/leads/lead-card-content";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

export const metadata: Metadata = { title: "Lead | marctco" };

/**
 * The direct-navigation / shared-link / hard-refresh fallback for a single
 * lead — same `getLead` Server Component read as the intercepted modal
 * (`@modal/(.)[opportunityId]/page.tsx`), rendered full-page instead of as
 * an overlay.
 */
export default async function LeadCardPage({
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
      <main className="min-h-[100dvh] bg-canvas px-md py-lg md:px-lg md:py-xl">
        <div className="mx-auto w-full max-w-content">
          <Link className="text-body-sm text-primary hover:underline" href={`/workspace/${slug}/leads`}>
            ← Leads
          </Link>
          <div className="mt-md rounded-xl border border-hairline bg-canvas p-lg md:p-xl">
            <LeadCardContent lead={lead} slug={slug} />
          </div>
        </div>
      </main>
    );
  } catch {
    notFound();
  }
}
