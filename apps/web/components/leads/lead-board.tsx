"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent
} from "@dnd-kit/core";
import { QueryClient, QueryClientProvider, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { LeadBoard as LeadBoardData, LeadBoardCard, LeadBoardColumn } from "@marctco/db";
import { boardEmptyState, buildBoardCardViewModel } from "../../lib/leads/board-view-model";
import { EmptyState } from "../ui/empty-state";

export interface LeadBoardProps {
  readonly board: LeadBoardData;
  readonly slug: string;
  readonly isSupervisorWithoutTeam: boolean;
}

interface StageMove {
  readonly opportunity_id: string;
  readonly current_stage_id: string;
  readonly stage_id: string;
}

export function LeadBoard(props: LeadBoardProps) {
  const [queryClient] = useState(() => new QueryClient());
  return (
    <QueryClientProvider client={queryClient}>
      <InteractiveLeadBoard {...props} />
    </QueryClientProvider>
  );
}

/**
 * DESIGN.md `{component.kanban-column}` + `{component.kanban-card}`. Columns
 * sit side by side from 768px up and collapse into a scroll-snap strip below
 * it ("Responsive Behavior > Collapsing Strategy") — never four 300px columns
 * squeezed onto a phone.
 *
 * The drag is optimistic (ADR-0013 lists the board as one of the two places
 * TanStack Query belongs): the card lands in the new column immediately, the
 * route handler confirms, and a refusal puts it back where it was with the
 * reason in plain PT-BR. What arbitrates is `moveLeadStage`'s `WHERE`, never
 * this cache.
 */
function InteractiveLeadBoard({ board, slug, isSupervisorWithoutTeam }: LeadBoardProps) {
  const router = useRouter();
  const cache = useQueryClient();
  const snapshot = board.columns
    .flatMap((column) => column.cards.map((card) => `${card.opportunity_id}:${column.stage_id}`))
    .join(",");
  const queryKey = ["lead-board", slug, snapshot] as const;
  const { data: columns = board.columns } = useQuery({
    queryKey,
    queryFn: () => Promise.resolve(board.columns),
    initialData: board.columns,
    staleTime: Infinity
  });
  const [notice, setNotice] = useState<string | null>(null);
  const [dragging, setDragging] = useState<LeadBoardCard | null>(null);

  const sensors = useSensors(
    // A click on the card's link must stay a click: the drag only begins
    // after the pointer has actually travelled.
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const mutation = useMutation({
    mutationFn: async (move: StageMove) => {
      const response = await fetch(`/workspace/${slug}/my-leads/stage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(move)
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(payload.error ?? "Não foi possível mover o lead.");
      return payload;
    },
    onMutate: async (move) => {
      await cache.cancelQueries({ queryKey });
      const previous = cache.getQueryData<readonly LeadBoardColumn[]>(queryKey) ?? columns;
      cache.setQueryData<readonly LeadBoardColumn[]>(queryKey, moveCardBetweenColumns(previous, move));
      setNotice(null);
      return { previous };
    },
    onError: (error, _move, context) => {
      if (context) cache.setQueryData(queryKey, context.previous);
      setNotice(error instanceof Error ? error.message : "Não foi possível mover o lead.");
    },
    onSuccess: () => {
      router.refresh();
    }
  });

  function onDragStart(event: DragStartEvent) {
    setDragging(findCard(columns, String(event.active.id)));
  }

  function onDragEnd(event: DragEndEvent) {
    setDragging(null);
    const stage_id = event.over ? String(event.over.id) : null;
    if (!stage_id) return;
    const opportunity_id = String(event.active.id);
    const current_stage_id = columns.find((column) =>
      column.cards.some((card) => card.opportunity_id === opportunity_id)
    )?.stage_id;
    if (!current_stage_id || current_stage_id === stage_id) return;
    mutation.mutate({ opportunity_id, current_stage_id, stage_id });
  }

  const total = columns.reduce((count, column) => count + column.cards.length, 0);
  if (board.pipeline_id === null) {
    return (
      <EmptyState
        description="Este workspace ainda não tem um funil comercial padrão."
        title="Nenhuma etapa para montar o quadro"
      />
    );
  }
  if (total === 0) {
    const copy = boardEmptyState({ isSupervisorWithoutTeam });
    return <EmptyState description={copy.description} title={copy.title} />;
  }

  return (
    <div className="grid gap-sm">
      {notice ? (
        <p
          className="rounded-md border border-warning bg-warning-surface p-sm text-body-sm text-warning-ink"
          role="status"
        >
          {notice}
        </p>
      ) : null}
      <DndContext
        accessibility={{ announcements: announcementsFor(columns) }}
        collisionDetection={closestCorners}
        onDragCancel={() => setDragging(null)}
        onDragEnd={onDragEnd}
        onDragStart={onDragStart}
        sensors={sensors}
      >
        <div className="flex snap-x snap-mandatory gap-sm overflow-x-auto pb-xs md:snap-none">
          {columns.map((column) => (
            <BoardColumn column={column} key={column.stage_id} slug={slug} />
          ))}
        </div>
        <DragOverlay>
          {dragging ? (
            <BoardCardSurface
              className="rotate-[1deg] shadow-overlay"
              model={buildBoardCardViewModel(dragging, stageLabelOf(columns, dragging.stage_id))}
              slug={slug}
            />
          ) : null}
        </DragOverlay>
      </DndContext>
    </div>
  );
}

function BoardColumn({ column, slug }: Readonly<{ column: LeadBoardColumn; slug: string }>) {
  const { isOver, setNodeRef } = useDroppable({ id: column.stage_id });
  return (
    <section
      aria-label={column.label}
      className={
        "w-[300px] shrink-0 snap-start rounded-lg bg-canvas-sunken p-sm md:snap-align-none "
        + (isOver ? "outline-2 outline-offset-[-2px] outline-primary" : "")
      }
      ref={setNodeRef}
    >
      <header className="flex items-baseline justify-between gap-xs px-xxs pb-sm">
        <h2 className="text-label text-ink">{column.label}</h2>
        <span className="text-caption tabular-nums text-ink-muted">{column.cards.length}</span>
      </header>
      <div className="grid gap-xs">
        {column.cards.map((card) => (
          <DraggableBoardCard
            card={card}
            key={card.opportunity_id}
            stageLabel={column.label}
            slug={slug}
          />
        ))}
      </div>
    </section>
  );
}

function DraggableBoardCard({
  card,
  slug,
  stageLabel
}: Readonly<{ card: LeadBoardCard; slug: string; stageLabel: string }>) {
  const { attributes, isDragging, listeners, setNodeRef } = useDraggable({ id: card.opportunity_id });
  const model = buildBoardCardViewModel(card, stageLabel);
  return (
    <div className={isDragging ? "opacity-40" : ""} ref={setNodeRef}>
      <BoardCardSurface
        handle={
          <button
            aria-label={`Mover ${model.name} de etapa`}
            className="inline-flex h-9 w-9 shrink-0 cursor-grab items-center justify-center rounded-md text-ink-muted hover:bg-surface-inset hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus pointer-coarse:h-11 pointer-coarse:w-11"
            type="button"
            {...attributes}
            {...listeners}
          >
            <span aria-hidden="true">⠿</span>
          </button>
        }
        model={model}
        slug={slug}
      />
    </div>
  );
}

/**
 * `{component.kanban-card}`: `{colors.canvas}` on 1px `{colors.hairline}`,
 * `{rounded.lg}`, `{spacing.sm}` padding, name in `{typography.body-strong}`.
 * Stage and responsible sit in the bottom row where the spec puts the badge
 * and the avatar. No monetary line — `amount` is Fase 7 (item A10).
 */
function BoardCardSurface({
  model,
  slug,
  handle,
  className = ""
}: Readonly<{
  model: ReturnType<typeof buildBoardCardViewModel>;
  slug: string;
  handle?: React.ReactNode;
  className?: string;
}>) {
  return (
    <article className={`rounded-lg border border-hairline bg-canvas p-sm ${className}`.trim()}>
      <div className="flex items-start justify-between gap-xs">
        <Link
          className="text-body-strong text-ink hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
          href={`/workspace/${slug}/leads/${model.opportunity_id}`}
        >
          {model.name}
        </Link>
        {handle}
      </div>
      <p className="mt-xs flex flex-wrap items-center gap-xs text-body-sm text-ink-muted">
        <span className="inline-flex items-center rounded-pill bg-surface-inset px-xs py-0.5 text-caption font-medium text-ink-muted">
          {model.stageLabel}
        </span>
        <span className="truncate">{model.responsibleLabel}</span>
      </p>
    </article>
  );
}

function findCard(columns: readonly LeadBoardColumn[], opportunity_id: string): LeadBoardCard | null {
  for (const column of columns) {
    const card = column.cards.find((item) => item.opportunity_id === opportunity_id);
    if (card) return card;
  }
  return null;
}

function stageLabelOf(columns: readonly LeadBoardColumn[], stage_id: string): string {
  return columns.find((column) => column.stage_id === stage_id)?.label ?? "";
}

function moveCardBetweenColumns(
  columns: readonly LeadBoardColumn[],
  move: StageMove
): readonly LeadBoardColumn[] {
  const card = findCard(columns, move.opportunity_id);
  if (!card) return columns;
  const moved: LeadBoardCard = { ...card, stage_id: move.stage_id };
  return columns.map((column) => {
    if (column.stage_id === move.current_stage_id) {
      return {
        ...column,
        cards: column.cards.filter((item) => item.opportunity_id !== move.opportunity_id)
      };
    }
    if (column.stage_id === move.stage_id) {
      return { ...column, cards: [moved, ...column.cards] };
    }
    return column;
  });
}

/**
 * dnd-kit announces in English and only knows the ids it was given; the UI
 * speaks PT-BR (ADR-0005) and a screen reader needs the lead's name and the
 * stage's label, not two UUIDs.
 */
function announcementsFor(columns: readonly LeadBoardColumn[]): Announcements {
  const leadName = (id: string) => findCard(columns, id)?.name?.trim() || "Lead sem nome";
  const stageName = (id: string) => stageLabelOf(columns, id) || "etapa desconhecida";
  return {
    onDragStart: ({ active }) => `${leadName(String(active.id))} levantado.`,
    onDragOver: ({ active, over }) =>
      over
        ? `${leadName(String(active.id))} sobre a etapa ${stageName(String(over.id))}.`
        : `${leadName(String(active.id))} fora de uma etapa.`,
    onDragEnd: ({ active, over }) =>
      over
        ? `${leadName(String(active.id))} solto na etapa ${stageName(String(over.id))}.`
        : `${leadName(String(active.id))} solto fora de uma etapa e voltou ao lugar.`,
    onDragCancel: ({ active }) => `Movimento de ${leadName(String(active.id))} cancelado.`
  };
}
