import { rescheduleActivity } from "@marctco/db";
import { NextResponse } from "next/server";
import { activityErrorMessage } from "../../../../../../../../lib/leads/activity-errors";
import { resolveWorkspaceAccess } from "../../../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

export async function POST(
  request: Request,
  {
    params
  }: Readonly<{ params: Promise<{ slug: string; opportunityId: string; activityId: string }> }>
): Promise<NextResponse> {
  const { slug, activityId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: { readonly due_at?: string };
  try {
    body = (await request.json()) as { readonly due_at?: string };
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  try {
    const rescheduled = await rescheduleActivity(access.workspace.context, {
      activity_id: activityId,
      due_at: body.due_at ? new Date(body.due_at) : new Date(Number.NaN)
    });
    return NextResponse.json(rescheduled);
  } catch (error: unknown) {
    return NextResponse.json({ error: activityErrorMessage(error) }, { status: 400 });
  }
}
