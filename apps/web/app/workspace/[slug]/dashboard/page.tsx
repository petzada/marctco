import type { Metadata } from "next";
import { getOperationalDashboard, listUnresolvedNotifications } from "@marctco/db";
import { notFound, redirect } from "next/navigation";
import { canReadDashboard } from "../../../../lib/dashboard-access";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";
import { DashboardView } from "./dashboard-view";

export const metadata: Metadata = {
  title: "Dashboard | marctco",
  description: "Os números do dia: o que está queimando agora no workspace"
};

/**
 * Server Component reading the Dashboard tiles/series and the unresolved
 * notification list in parallel (ADR-0013). Access is refused here for
 * Atendente; hiding the sidebar item is not enough (ADR-0015).
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

  const context = access.workspace.context;
  const dashboardPromise = getOperationalDashboard(context, { now: new Date() });
  const notificationsPromise = listUnresolvedNotifications(context);
  const [dashboard, notifications] = await Promise.all([
    dashboardPromise,
    notificationsPromise
  ]);
  return (
    <DashboardView dashboard={dashboard} notifications={notifications.items} slug={slug} />
  );
}
