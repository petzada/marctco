import type { LeadTimelineFact, OpportunityTimelineEventType } from "@marctco/db";
import { formatArrivedAt } from "./row-view-model.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const SOURCE_LABELS: Readonly<Record<string, string>> = {
  META_LEAD_ADS: "Meta",
  GOOGLE_LEAD_FORM: "Google",
  LANDING_PAGE: "Landing page"
};

const ACTIVITY_TYPE_LABELS: Readonly<Record<NonNullable<LeadTimelineFact["activity_type"]>, string>> = {
  CALL: "Ligação",
  MESSAGE: "Mensagem",
  MEETING: "Reunião",
  TASK: "Tarefa"
};

export interface LeadTimelineItemView {
  readonly id: string;
  readonly occurredAtLabel: string;
  readonly caption: string;
}

/**
 * Card copy for one timeline fact. Names stay human-readable; opaque ids
 * never reach the caption (ADR-0005: UI in PT-BR, no screen text in domain).
 */
export function buildLeadTimelineItemView(fact: LeadTimelineFact): LeadTimelineItemView {
  return {
    id: fact.id,
    occurredAtLabel: formatArrivedAt(fact.occurred_at),
    caption: captionFor(fact)
  };
}

function visibleName(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed === "" || UUID_PATTERN.test(trimmed)) {
    return null;
  }
  return trimmed;
}

function captionFor(fact: LeadTimelineFact): string {
  const previous = visibleName(fact.previous_assigned_user_name);
  const assigned = visibleName(fact.assigned_user_name);
  const title = fact.activity_title?.trim() || null;
  const activityKind = fact.activity_type ? ACTIVITY_TYPE_LABELS[fact.activity_type] : null;
  const type = fact.type satisfies OpportunityTimelineEventType;

  switch (type) {
    case "RETRANSMISSION_RECEIVED": {
      const origin = fact.ingestion_source ? SOURCE_LABELS[fact.ingestion_source] : null;
      return origin ? `Reenvio recebido da origem ${origin}` : "Reenvio recebido";
    }
    case "SUBMISSION_REENTERED":
      return "Envio reentrou neste lead";
    case "STAGE_CHANGED":
      return "Etapa alterada";
    case "ASSIGNED":
      return assigned ? `Atribuído a ${assigned}` : "Atribuído";
    case "REASSIGNED":
      if (previous && assigned) {
        return `Reatribuído de ${previous} para ${assigned}`;
      }
      if (previous) {
        return `Reatribuído de ${previous}`;
      }
      if (assigned) {
        return `Reatribuído para ${assigned}`;
      }
      return "Reatribuído";
    case "RETURNED_TO_QUEUE":
      return previous ? `Devolvido à fila (saída de ${previous})` : "Devolvido à fila";
    case "ACTIVITY_CREATED": {
      const labeled = title ?? activityKind;
      return labeled ? `Atividade marcada: ${labeled}` : "Atividade marcada";
    }
    case "ACTIVITY_COMPLETED": {
      const labeled = title ?? activityKind;
      return labeled ? `Atividade concluída: ${labeled}` : "Atividade concluída";
    }
    default: {
      const unknown: never = type;
      return unknown;
    }
  }
}
