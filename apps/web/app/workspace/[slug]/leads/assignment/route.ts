import { assignLeads, reassignLeads } from "@marctco/db";
import { NextResponse } from "next/server";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

type AssignmentBody =
  | { readonly mode: "ASSIGN"; readonly opportunity_ids: readonly string[]; readonly user_id: string }
  | {
      readonly mode: "REASSIGN";
      readonly assignments: readonly { readonly opportunity_id: string; readonly current_user_id: string }[];
      readonly user_id: string;
    };

export async function POST(
  request: Request,
  { params }: Readonly<{ params: Promise<{ slug: string }> }>
): Promise<NextResponse> {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") return NextResponse.json({ error: "not_found" }, { status: 404 });

  try {
    const body = (await request.json()) as AssignmentBody;
    const result = body.mode === "ASSIGN"
      ? await assignLeads(access.workspace.context, { opportunity_ids: body.opportunity_ids, user_id: body.user_id })
      : body.mode === "REASSIGN"
        ? await reassignLeads(access.workspace.context, { assignments: body.assignments, user_id: body.user_id })
        : null;
    if (!result) return NextResponse.json({ error: "invalid_mode" }, { status: 400 });
    return NextResponse.json(result);
  } catch (error: unknown) {
    const code = error instanceof Error ? error.message : "invalid_request";
    const messages: Readonly<Record<string, string>> = {
      ACTOR_CANNOT_ASSIGN: "Seu perfil não pode atribuir leads da fila.",
      ACTOR_CANNOT_REASSIGN: "Seu perfil não pode reatribuir leads.",
      DESTINATION_INACTIVE: "O responsável escolhido não está ativo.",
      DESTINATION_MUST_BE_SUPERVISOR_OR_SELF: "Da fila, escolha um Supervisor com equipe ou assuma o lead.",
      SUPERVISOR_REQUIRES_TAG: "O Supervisor precisa ter uma equipe antes de receber leads.",
      CURRENT_OWNER_OUTSIDE_TEAM: "O responsável atual não pertence à sua equipe.",
      DESTINATION_OUTSIDE_TEAM: "O novo responsável não pertence à sua equipe.",
      LEAD_ASSIGNMENT_CONFLICT: "O lead mudou enquanto você distribuía. Atualize a lista e tente novamente."
    };
    return NextResponse.json({ error: messages[code] ?? "Não foi possível distribuir os leads." }, { status: 400 });
  }
}
