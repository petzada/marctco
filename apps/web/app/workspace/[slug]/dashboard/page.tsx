import type { Metadata } from "next";
import { getOperationalDashboard } from "@marctco/db";
import { notFound, redirect } from "next/navigation";
import { canReadDashboard } from "../../../../lib/dashboard-access";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard | marctco",
  description: "Os números do dia: o que está queimando agora no workspace"
};

/**
 * Server Component reading `getOperationalDashboard` directly (ADR-0013).
 * Access is refused here for Atendente; hiding the sidebar item is not
 * enough (ADR-0015).
 */
export default async function DashboardPage({
  params
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    redirect("/login");
  }
  if (access.status === "not-found" || !canReadDashboard(access.workspace.role)) {
    notFound();
  }

  const dashboard = await getOperationalDashboard(access.workspace.context, {
    now: new Date()
  });
  return <DashboardView dashboard={dashboard} slug={slug} />;
}
