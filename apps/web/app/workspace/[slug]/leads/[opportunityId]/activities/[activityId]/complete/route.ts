import { completeActivity } from "@marctco/db";
import { NextResponse } from "next/server";
import { activityErrorMessage } from "../../../../../../../../lib/leads/activity-errors";
import { resolveWorkspaceAccess } from "../../../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

export async function POST(
  _request: Request,
  {
    params
  }: Readonly<{ params: Promise<{ slug: string; opportunityId: string; activityId: string }> }>
): Promise<NextResponse> {
  const { slug, activityId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  try {
    const completed = await completeActivity(access.workspace.context, activityId);
    return NextResponse.json(completed);
  } catch (error: unknown) {
    return NextResponse.json({ error: activityErrorMessage(error) }, { status: 400 });
  }
}
