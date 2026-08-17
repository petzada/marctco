import { createActivity } from "@marctco/db";
import { NextResponse } from "next/server";
import { activityErrorMessage } from "../../../../../../lib/leads/activity-errors";
import { resolveWorkspaceAccess } from "../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

interface CreateActivityBody {
  readonly type?: string;
  readonly title?: string;
  readonly notes?: string | null;
  readonly due_at?: string;
  readonly assigned_user_id?: string;
}

export async function POST(
  request: Request,
  { params }: Readonly<{ params: Promise<{ slug: string; opportunityId: string }> }>
): Promise<NextResponse> {
  const { slug, opportunityId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: CreateActivityBody;
  try {
    body = (await request.json()) as CreateActivityBody;
  } catch {
    return NextResponse.json({ error: "Pedido inválido." }, { status: 400 });
  }

  const due_at = body.due_at ? new Date(body.due_at) : new Date(Number.NaN);
  try {
    const created = await createActivity(access.workspace.context, {
      opportunity_id: opportunityId,
      type: body.type ?? "",
      title: body.title ?? "",
      due_at,
      ...(body.notes !== undefined ? { notes: body.notes } : {}),
      ...(body.assigned_user_id !== undefined ? { assigned_user_id: body.assigned_user_id } : {})
    });
    return NextResponse.json(created);
  } catch (error: unknown) {
    return NextResponse.json({ error: activityErrorMessage(error) }, { status: 400 });
  }
}
