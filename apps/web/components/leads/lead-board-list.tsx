import Link from "next/link";
import type { LeadBoard } from "@marctco/db";
import { boardEmptyState, flattenBoard } from "../../lib/leads/board-view-model";
import { Card } from "../ui/card";
import { DataTable, DataTableCell, DataTableHeaderCell, DataTableRow } from "../ui/data-table";
import { EmptyState } from "../ui/empty-state";

export interface LeadBoardListProps {
  readonly board: LeadBoard;
  readonly slug: string;
  readonly isSupervisorWithoutTeam: boolean;
}

/**
 * The Lista half of the toggle — "às vezes preciso varrer nomes, não
 * colunas". It reads the **same** board the Kanban renders, so the two views
 * can never disagree about what is open, and it stays a Server Component:
 * scanning names needs no drag and no client cache.
 */
export function LeadBoardList({ board, slug, isSupervisorWithoutTeam }: LeadBoardListProps) {
  const cards = flattenBoard(board);
  if (cards.length === 0) {
    const copy = boardEmptyState({ isSupervisorWithoutTeam });
    return <EmptyState description={copy.description} title={copy.title} />;
  }

  return (
    <>
      <div className="hidden min-[480px]:block">
        <DataTable caption="Meus leads em aberto">
          <thead>
            <tr>
              <DataTableHeaderCell>Nome</DataTableHeaderCell>
              <DataTableHeaderCell>Etapa</DataTableHeaderCell>
              <DataTableHeaderCell>Responsável</DataTableHeaderCell>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => (
              <DataTableRow key={card.opportunity_id}>
                <DataTableCell strong>
                  <Link
                    className="hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
                    href={`/workspace/${slug}/leads/${card.opportunity_id}`}
                  >
                    {card.name}
                  </Link>
                </DataTableCell>
                <DataTableCell>{card.stageLabel}</DataTableCell>
                <DataTableCell>{card.responsibleLabel}</DataTableCell>
              </DataTableRow>
            ))}
          </tbody>
        </DataTable>
      </div>

      <div className="grid gap-sm min-[480px]:hidden">
        {cards.map((card) => (
          <Card className="p-md" key={card.opportunity_id}>
            <Link
              className="text-body-strong text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
              href={`/workspace/${slug}/leads/${card.opportunity_id}`}
            >
              {card.name}
            </Link>
            <dl className="mt-sm grid grid-cols-2 gap-x-sm gap-y-xs text-body-sm">
              <div>
                <dt className="text-caption text-ink-muted">Etapa</dt>
                <dd className="text-ink">{card.stageLabel}</dd>
              </div>
              <div>
                <dt className="text-caption text-ink-muted">Responsável</dt>
                <dd className="text-ink">{card.responsibleLabel}</dd>
              </div>
            </dl>
          </Card>
        ))}
      </div>
    </>
  );
}
