import type { LeadBoard, LeadBoardCard } from "@marctco/db";
import { supervisorTeamEmptyState } from "../supervisor-team-empty-state";

/**
 * What a `{component.kanban-card}` renders, built once from what
 * `getLeadBoard` returned: nome, etapa, responsável. **No monetary field** —
 * `amount` left Fase 2 with item A10 of the plan, and `installment_amount`
 * belongs to the triage table, not to the card the attendant drags.
 */
export interface BoardCardViewModel {
  readonly opportunity_id: string;
  readonly stage_id: string;
  readonly name: string;
  readonly stageLabel: string;
  readonly responsibleLabel: string;
}

export function buildBoardCardViewModel(
  card: LeadBoardCard,
  stageLabel: string
): BoardCardViewModel {
  return {
    opportunity_id: card.opportunity_id,
    stage_id: card.stage_id,
    name: card.name?.trim() || "Sem nome",
    stageLabel,
    responsibleLabel: card.assigned_user_name?.trim() || "Sem responsável"
  };
}

/**
 * The Lista half of the toggle: the same cards the columns hold, read in
 * stage order. One board, one query, two ways of looking at it — a second
 * read would let the two views disagree about what is open.
 */
export function flattenBoard(board: LeadBoard): readonly BoardCardViewModel[] {
  return board.columns.flatMap((column) =>
    column.cards.map((card) => buildBoardCardViewModel(card, column.label))
  );
}

/**
 * An empty board says why it is empty. For a Supervisor still without a tag
 * that reason is the missing tag and the Direção resolves it — the queue is
 * never offered as a consolation (ADR-0024).
 */
export function boardEmptyState(
  input: Readonly<{ isSupervisorWithoutTeam: boolean }>
): { readonly title: string; readonly description: string } {
  if (input.isSupervisorWithoutTeam) {
    return {
      title: "Seu time ainda não aparece no quadro",
      description: supervisorTeamEmptyState("leads").description
    };
  }
  return {
    title: "Nenhum lead no seu quadro",
    description: "Assim que um lead for atribuído a você, ele aparece na primeira etapa."
  };
}
