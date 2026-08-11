import { resolveIdentityConflict, type IdentityConflictResolution } from "@marctco/db";
import { NextResponse } from "next/server";
import { resolveWorkspaceAccess } from "../../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

interface ResolveIdentityBody {
  readonly resolution: IdentityConflictResolution;
  readonly reason: string;
  readonly canonical_person_id?: string;
}

/**
 * The identity half of "a resolução acontece aqui": merge into a candidate
 * Pessoa or confirm distinct people. Never a delete (ADR-0007 §Identidade).
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

  let body: ResolveIdentityBody;
  try {
    body = (await request.json()) as ResolveIdentityBody;
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const result = await resolveIdentityConflict(access.workspace.context, {
      review_id: reviewId,
      resolution: body.resolution,
      reason: body.reason,
      resolved_at: new Date(),
      ...(body.canonical_person_id !== undefined
        ? { canonical_person_id: body.canonical_person_id }
        : {})
    });
    return NextResponse.json(result);
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown_error" },
      { status: 400 }
    );
  }
}
