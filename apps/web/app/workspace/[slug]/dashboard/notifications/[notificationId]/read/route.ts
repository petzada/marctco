import { markNotificationRead } from "@marctco/db";
import { NextResponse } from "next/server";
import { canReadDashboard } from "../../../../../../../lib/dashboard-access";
import { resolveWorkspaceAccess } from "../../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  {
    params
  }: Readonly<{ params: Promise<{ slug: string; notificationId: string }> }>
): Promise<NextResponse> {
  const { slug, notificationId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved" || !canReadDashboard(access.workspace.role)) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    await markNotificationRead(access.workspace.context, {
      notification_id: notificationId,
      now: new Date()
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
