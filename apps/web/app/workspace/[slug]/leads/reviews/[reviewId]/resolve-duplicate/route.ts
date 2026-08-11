import { resolveIntakeReview } from "@marctco/db";
import type { PossibleDuplicateResolution } from "@marctco/domain";
import { NextResponse } from "next/server";
import { resolveWorkspaceAccess } from "../../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

interface ResolveDuplicateBody {
  readonly resolution: PossibleDuplicateResolution;
  readonly reason: string;
}

/**
 * "A resolução acontece aqui, não em Integrações": `NEW_FINANCING`,
 * `SAME_FINANCING` and `INVALID_OR_SPAM` are the only three outcomes this
 * offers — never "excluir duplicado" (ADR-0007).
 */
export async function POST(
  request: Request,
  { params }: Readonly<{ params: Promise<{ slug: string; reviewId: string }> }>
): Promise<NextResponse> {
  const { slug, reviewId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  let body: ResolveDuplicateBody;
  try {
    body = (await request.json()) as ResolveDuplicateBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await resolveIntakeReview(access.workspace.context, {
      review_id: reviewId,
      resolution: body.resolution,
      reason: body.reason,
      resolved_at: new Date()
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown_error" },
      { status: 400 }
    );
  }
}
