import type { LeadTimelinePage } from "@marctco/db";
import { EmptyState } from "../ui/empty-state";
import { buildLeadTimelineItemView } from "../../lib/leads/timeline-view-model";

export interface LeadCardTimelineProps {
  readonly timeline: LeadTimelinePage;
}

/**
 * Read-only history on the lead card. Facts are immutable; this surface
 * never offers an edit (ticket 05). Channel facts show a truncated preview,
 * never a composer or inbox (ticket 06).
 */
export function LeadCardTimeline({ timeline }: LeadCardTimelineProps) {
  const items = timeline.facts.map(buildLeadTimelineItemView);

  return (
    <section className="grid gap-md">
      <h4 className="text-label text-ink-secondary">Linha do tempo</h4>
      {items.length === 0 ? (
        <EmptyState
          description="Atribuições, etapas, atividades e mensagens deste lead aparecem aqui."
          title="Nenhum fato neste lead"
        />
      ) : (
        <ol className="grid gap-sm">
          {items.map((item) => (
            <li className="rounded-lg border border-hairline bg-canvas p-md" key={item.id}>
              <p className="text-body text-ink">{item.caption}</p>
              {item.preview ? <p className="mt-xxs text-body-sm text-ink-secondary">{item.preview}</p> : null}
              <p className="mt-xxs text-body-sm text-ink-muted">
                <span className="tabular-nums">{item.occurredAtLabel}</span>
              </p>
            </li>
          ))}
        </ol>
      )}
      {timeline.has_more ? (
        <p className="text-caption text-ink-muted">Mostrando os fatos mais recentes.</p>
      ) : null}
    </section>
  );
}
