import { countNewLeads } from "@marctco/db";
import { NextResponse } from "next/server";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

/**
 * The "small periodic count" ADR-0013 describes for "N novos leads —
 * atualizar". It never moves the list itself — the list only moves when the
 * gestor clicks "atualizar" and `router.refresh()` re-renders the Server
 * Component tree. Supabase Realtime is not an option here (ADR-0006 regra 8).
 */
export async function GET(
  request: Request,
  { params }: Readonly<{ params: Promise<{ slug: string }> }>
): Promise<NextResponse> {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  const url = new URL(request.url);
  const arrived_at = url.searchParams.get("arrived_at");
  const id = url.searchParams.get("id");
  if (!arrived_at || !id) {
    return NextResponse.json({ error: "missing_cursor" }, { status: 400 });
  }

  try {
    const count = await countNewLeads(access.workspace.context, { arrived_at: new Date(arrived_at), id });
    return NextResponse.json({ count });
  } catch (error: unknown) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "unknown_error" },
      { status: 400 }
    );
  }
}
