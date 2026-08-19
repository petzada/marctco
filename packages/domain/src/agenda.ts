/**
 * Agenda is a calendar view over Activity, not a second store. The named
 * operation receives a closed interval; a calendar without a ceiling is
 * OFFSET by another name (Fase 3 spec).
 *
 * Day and week are the only views the screen offers, so the ceiling is one
 * week — the largest window the UI can ask for.
 */
export const MAX_AGENDA_RANGE_MS = 7 * 24 * 60 * 60 * 1000;

export const AGENDA_VIEWS = ["day", "week"] as const;
export type AgendaViewKind = (typeof AGENDA_VIEWS)[number];

/** Dashboard tile lands on `?due=overdue` — every open activity past due_at. */
export const AGENDA_DUE_FILTERS = ["overdue"] as const;
export type AgendaDueFilter = (typeof AGENDA_DUE_FILTERS)[number];

export function parseAgendaDueFilter(
  value: string | null | undefined
): AgendaDueFilter | undefined {
  if (value && (AGENDA_DUE_FILTERS as readonly string[]).includes(value)) {
    return value as AgendaDueFilter;
  }
  return undefined;
}

export type AgendaIntervalRefusal = "INVALID_RANGE" | "RANGE_TOO_LONG";

export type AgendaIntervalDecision =
  | { readonly ok: true; readonly from: Date; readonly to: Date }
  | { readonly ok: false; readonly reason: AgendaIntervalRefusal };

const DATE_ONLY = /^(\d{4})-(\d{2})-(\d{2})$/;
const WEEKDAY_TO_MONDAY_OFFSET: Readonly<Record<string, number>> = {
  Mon: 0,
  Tue: 1,
  Wed: 2,
  Thu: 3,
  Fri: 4,
  Sat: 5,
  Sun: 6
};

export function isAgendaView(value: string): value is AgendaViewKind {
  return (AGENDA_VIEWS as readonly string[]).includes(value);
}

export function parseAgendaInterval(input: Readonly<{
  from: Date;
  to: Date;
}>): AgendaIntervalDecision {
  if (!(input.from instanceof Date) || Number.isNaN(input.from.getTime())) {
    return { ok: false, reason: "INVALID_RANGE" };
  }
  if (!(input.to instanceof Date) || Number.isNaN(input.to.getTime())) {
    return { ok: false, reason: "INVALID_RANGE" };
  }
  const duration = input.to.getTime() - input.from.getTime();
  if (duration <= 0) {
    return { ok: false, reason: "INVALID_RANGE" };
  }
  if (duration > MAX_AGENDA_RANGE_MS) {
    return { ok: false, reason: "RANGE_TOO_LONG" };
  }
  return { ok: true, from: input.from, to: input.to };
}

/**
 * Turns the URL's calendar date + day/week toggle into the closed interval
 * `listAgenda` receives. Dates are civil dates in the workspace timezone,
 * default America/Sao_Paulo — never the server's local zone.
 */
export function agendaBoundsForView(input: Readonly<{
  view: AgendaViewKind;
  date: string;
  timeZone?: string;
}>): AgendaIntervalDecision {
  const timeZone = input.timeZone ?? "America/Sao_Paulo";
  if (!DATE_ONLY.test(input.date)) {
    return { ok: false, reason: "INVALID_RANGE" };
  }
  const startDate = input.view === "week" ? mondayOf(input.date, timeZone) : input.date;
  const from = instantAtTimeZone(startDate, 0, 0, timeZone);
  if (!from) {
    return { ok: false, reason: "INVALID_RANGE" };
  }
  const days = input.view === "week" ? 7 : 1;
  const toDate = addCivilDays(startDate, days);
  const to = instantAtTimeZone(toDate, 0, 0, timeZone);
  if (!to) {
    return { ok: false, reason: "INVALID_RANGE" };
  }
  return parseAgendaInterval({ from, to });
}

export function shiftAgendaDate(date: string, days: number): string {
  if (!DATE_ONLY.test(date)) {
    return date;
  }
  return addCivilDays(date, days);
}

export function todayAgendaDate(now: Date = new Date(), timeZone = "America/Sao_Paulo"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(now);
  const read = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${read("year")}-${read("month")}-${read("day")}`;
}

function mondayOf(date: string, timeZone: string): string {
  const noon = instantAtTimeZone(date, 12, 0, timeZone);
  if (!noon) {
    return date;
  }
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short"
  }).format(noon);
  const offset = WEEKDAY_TO_MONDAY_OFFSET[weekday] ?? 0;
  return addCivilDays(date, -offset);
}

function addCivilDays(date: string, days: number): string {
  const match = DATE_ONLY.exec(date);
  if (!match) {
    return date;
  }
  const shifted = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]) + days));
  const year = String(shifted.getUTCFullYear()).padStart(4, "0");
  const month = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const day = String(shifted.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function instantAtTimeZone(
  date: string,
  hour: number,
  minute: number,
  timeZone: string
): Date | null {
  const match = DATE_ONLY.exec(date);
  if (!match) {
    return null;
  }
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  let utc = Date.UTC(year, month - 1, day, hour + 3, minute, 0);
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = zonedParts(new Date(utc), timeZone);
    if (!parts) {
      return null;
    }
    const got = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
    const wanted = Date.UTC(year, month - 1, day, hour, minute, 0);
    const delta = wanted - got;
    utc += delta;
    if (delta === 0) {
      return new Date(utc);
    }
  }
  return new Date(utc);
}

function zonedParts(
  instant: Date,
  timeZone: string
): { year: number; month: number; day: number; hour: number; minute: number; second: number } | null {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).formatToParts(instant);
  const read = (type: Intl.DateTimeFormatPartTypes): number => {
    const value = parts.find((part) => part.type === type)?.value;
    return value ? Number(value) : Number.NaN;
  };
  const year = read("year");
  const month = read("month");
  const day = read("day");
  const hour = read("hour");
  const minute = read("minute");
  const second = read("second");
  if ([year, month, day, hour, minute, second].some((value) => Number.isNaN(value))) {
    return null;
  }
  return { year, month, day, hour, minute, second };
}
