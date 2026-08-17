import { LeadStageMoveError, moveLeadStage } from "@marctco/db";
import { NextResponse } from "next/server";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

/**
 * The board writes here and nowhere else (ADR-0013: Server Component reads,
 * route handler writes, no Server Action). The handler owns none of the rule
 * — it hands three identifiers to `moveLeadStage` and turns the refusal it
 * gets back into a sentence in PT-BR (ADR-0005).
 */
export async function POST(
  request: Request,
  { params }: Readonly<{ params: Promise<{ slug: string }> }>
): Promise<NextResponse> {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") return NextResponse.json({ error: "not_found" }, { status: 404 });

  const body = (await request.json().catch(() => null)) as Partial<{
    opportunity_id: string;
    current_stage_id: string;
    stage_id: string;
  }> | null;
  const opportunity_id = body?.opportunity_id;
  const current_stage_id = body?.current_stage_id;
  const stage_id = body?.stage_id;
  if (
    typeof opportunity_id !== "string"
    || typeof current_stage_id !== "string"
    || typeof stage_id !== "string"
  ) {
    return NextResponse.json({ error: "Não foi possível mover o lead." }, { status: 400 });
  }

  try {
    const moved = await moveLeadStage(access.workspace.context, {
      opportunity_id,
      current_stage_id,
      stage_id
    });
    return NextResponse.json(moved);
  } catch (error: unknown) {
    if (error instanceof LeadStageMoveError) {
      const messages: Readonly<Record<string, string>> = {
        NOT_VISIBLE: "Este lead não está no seu quadro.",
        OPPORTUNITY_CLOSED: "Lead ganho ou perdido não muda de etapa.",
        OPPORTUNITY_MERGED: "Este lead foi mesclado em outro e não muda de etapa.",
        DESTINATION_NOT_A_STAGE: "A etapa de destino não existe neste workspace.",
        DESTINATION_OUTSIDE_PIPELINE: "A etapa de destino é de outro funil.",
        STAGE_CHANGED: "Este lead mudou de etapa enquanto você arrastava. Atualize o quadro."
      };
      return NextResponse.json(
        { error: messages[error.reason] ?? "Não foi possível mover o lead." },
        { status: error.reason === "STAGE_CHANGED" ? 409 : 400 }
      );
    }
    return NextResponse.json({ error: "Não foi possível mover o lead." }, { status: 400 });
  }
}
