import { createSearchParamsCache, parseAsString, parseAsStringLiteral } from "nuqs/server";
import {
  AGENDA_DUE_FILTERS,
  AGENDA_VIEWS,
  agendaBoundsForView,
  isAgendaView,
  todayAgendaDate,
  type AgendaDueFilter,
  type AgendaViewKind
} from "@marctco/domain";

export const agendaSearchParams = {
  view: parseAsStringLiteral(AGENDA_VIEWS).withDefault("day"),
  date: parseAsString,
  due: parseAsStringLiteral(AGENDA_DUE_FILTERS),
  responsible: parseAsString,
  tag: parseAsString,
  pipeline: parseAsString
};

export const agendaSearchParamsCache = createSearchParamsCache(agendaSearchParams);

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface AgendaQuery {
  readonly view: AgendaViewKind;
  readonly date: string;
  readonly due?: AgendaDueFilter;
  readonly responsible_user_id?: string;
  readonly tag_id?: string;
  readonly pipeline_id?: string;
}

export function resolveAgendaQuery(input: Readonly<{
  view?: string | null;
  date?: string | null;
  due?: string | null;
  responsible?: string | null;
  tag?: string | null;
  pipeline?: string | null;
}>): AgendaQuery {
  const view = input.view && isAgendaView(input.view) ? input.view : "day";
  const date = input.date && /^\d{4}-\d{2}-\d{2}$/.test(input.date) ? input.date : todayAgendaDate();
  const query: AgendaQuery = { view, date };
  const due = input.due === "overdue" ? "overdue" : undefined;
  const responsible_user_id = uuidOrUndefined(input.responsible);
  const tag_id = uuidOrUndefined(input.tag);
  const pipeline_id = uuidOrUndefined(input.pipeline);
  if (due) {
    Object.assign(query, { due });
  }
  if (responsible_user_id) {
    Object.assign(query, { responsible_user_id });
  }
  if (tag_id) {
    Object.assign(query, { tag_id });
  }
  if (pipeline_id) {
    Object.assign(query, { pipeline_id });
  }
  return query;
}

export interface AgendaHrefPatch {
  readonly view?: AgendaViewKind;
  readonly date?: string;
  readonly due?: AgendaDueFilter | null;
  readonly responsible_user_id?: string | null;
  readonly tag_id?: string | null;
  readonly pipeline_id?: string | null;
}

export function agendaHref(slug: string, query: AgendaQuery, patch: AgendaHrefPatch = {}): string {
  const nextView = patch.view ?? query.view;
  const nextDate = patch.date ?? query.date;
  const due = patch.due === null ? undefined : (patch.due ?? query.due);
  const responsible = patch.responsible_user_id === null ? undefined : (patch.responsible_user_id ?? query.responsible_user_id);
  const tag = patch.tag_id === null ? undefined : (patch.tag_id ?? query.tag_id);
  const pipeline = patch.pipeline_id === null ? undefined : (patch.pipeline_id ?? query.pipeline_id);
  const params = new URLSearchParams();
  if (nextView !== "day") params.set("view", nextView);
  params.set("date", nextDate);
  if (due) params.set("due", due);
  if (responsible) params.set("responsible", responsible);
  if (tag) params.set("tag", tag);
  if (pipeline) params.set("pipeline", pipeline);
  const encoded = params.toString();
  return `/workspace/${slug}/agenda${encoded ? `?${encoded}` : ""}`;
}

export function agendaListOptions(
  query: AgendaQuery,
  now: Date = new Date()
): {
  readonly from: Date;
  readonly to: Date;
  readonly responsible_user_id?: string;
  readonly tag_id?: string;
  readonly pipeline_id?: string;
  readonly overdue_only?: boolean;
  readonly now?: Date;
} {
  const bounds = agendaBoundsForView({ view: query.view, date: query.date });
  const window = bounds.ok ? bounds : agendaBoundsForView({ view: "day", date: todayAgendaDate() });
  if (!window.ok) {
    throw new Error("INVALID_RANGE");
  }
  const options: {
    from: Date;
    to: Date;
    responsible_user_id?: string;
    tag_id?: string;
    pipeline_id?: string;
    overdue_only?: boolean;
    now?: Date;
  } = { from: window.from, to: window.to };
  if (query.responsible_user_id) options.responsible_user_id = query.responsible_user_id;
  if (query.tag_id) options.tag_id = query.tag_id;
  if (query.pipeline_id) options.pipeline_id = query.pipeline_id;
  if (query.due === "overdue") {
    options.overdue_only = true;
    options.now = now;
  }
  return options;
}

function uuidOrUndefined(value: string | null | undefined): string | undefined {
  return value && UUID_PATTERN.test(value) ? value : undefined;
}
