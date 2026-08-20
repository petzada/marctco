import type { LeadTimelineFact, OpportunityTimelineEventType } from "@marctco/db";
import { INBOUND_MESSAGE_PREVIEW_MAX_CHARS } from "@marctco/domain";
import { formatArrivedAt } from "./row-view-model";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const PROVIDER_URL = /^https?:\/\//i;

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

const INBOUND_MEDIA_COPY: Readonly<Record<string, string>> = {
  imageMessage: "Imagem recebida no WhatsApp",
  videoMessage: "Vídeo recebido no WhatsApp",
  audioMessage: "Áudio recebido no WhatsApp",
  documentMessage: "Documento recebido no WhatsApp",
  reactionMessage: "Reação recebida no WhatsApp"
};

export interface LeadTimelineItemView {
  readonly id: string;
  readonly occurredAtLabel: string;
  readonly caption: string;
  readonly preview: string | null;
}

/**
 * Card copy for one timeline fact. Names stay human-readable; opaque ids
 * never reach the caption (ADR-0005: UI in PT-BR, no screen text in domain).
 */
export function buildLeadTimelineItemView(fact: LeadTimelineFact): LeadTimelineItemView {
  const inbound = fact.type === "WHATSAPP_INBOUND_RECEIVED" ? inboundCopy(fact.message_preview) : null;
  return {
    id: fact.id,
    occurredAtLabel: formatArrivedAt(fact.occurred_at),
    caption: inbound?.caption ?? captionFor(fact),
    preview: inbound?.preview ?? null
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

function inboundCopy(stored: string | null): { readonly caption: string; readonly preview: string | null } {
  const raw = stored?.trim() || "";
  if (raw === "") {
    return { caption: "Resposta recebida no WhatsApp", preview: null };
  }

  for (const [messageType, caption] of Object.entries(INBOUND_MEDIA_COPY)) {
    if (raw === messageType) {
      return { caption, preview: null };
    }
    const prefix = `${messageType}: `;
    if (raw.startsWith(prefix)) {
      return { caption, preview: visiblePreview(raw.slice(prefix.length)) };
    }
  }

  return { caption: "Resposta recebida no WhatsApp", preview: visiblePreview(raw) };
}

function visiblePreview(value: string): string | null {
  const trimmed = value.trim();
  if (trimmed === "" || PROVIDER_URL.test(trimmed)) {
    return null;
  }
  return trimmed.length <= INBOUND_MESSAGE_PREVIEW_MAX_CHARS
    ? trimmed
    : trimmed.slice(0, INBOUND_MESSAGE_PREVIEW_MAX_CHARS);
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
    case "WHATSAPP_OUTBOUND_SENT":
      return "Envio aceito pelo canal";
    case "WHATSAPP_OUTBOUND_FAILED":
      return "Tentativa automática encerrada sem envio";
    case "WHATSAPP_INBOUND_RECEIVED":
      return "Resposta recebida no WhatsApp";
    default: {
      const unknown: never = type;
      return unknown;
    }
  }
}
