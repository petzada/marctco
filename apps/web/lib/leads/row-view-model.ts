import { markersFor, type Marker } from "@marctco/domain";
import type { FinancingType, LeadListRow, LeadSource } from "@marctco/db";

/**
 * What the row (and the stacked mobile card) render, built once from the
 * `LeadListRow` `listLeads` returns. `markers` is the **only** aggregation —
 * computed by `markersFor`, the same function the card and the comparison
 * call, never re-derived per surface (ADR-0018).
 */
export interface LeadRowViewModel {
  readonly opportunity_id: string;
  readonly name: string;
  readonly contact: string;
  readonly financingTypeLabel: string;
  readonly institutionLabel: string;
  readonly originLabel: string;
  readonly campaignLabel: string;
  readonly formLabel: string;
  readonly arrivedAt: Date;
  readonly markers: readonly Marker[];
}

const FINANCING_TYPE_LABELS: Readonly<Record<FinancingType, string>> = {
  VEHICLE: "Veículo",
  REAL_ESTATE: "Imóvel",
  PERSONAL_LOAN: "Empréstimo pessoal",
  OTHER: "Outro"
};

const SOURCE_LABELS: Readonly<Record<LeadSource, string>> = {
  META_LEAD_ADS: "Meta",
  GOOGLE_LEAD_FORM: "Google",
  LANDING_PAGE: "Landing page"
};

const EMPTY = "—";

export function buildLeadRowViewModel(row: LeadListRow): LeadRowViewModel {
  return {
    opportunity_id: row.opportunity_id,
    name: row.name?.trim() || "Sem nome",
    contact: primaryContact(row.phones, row.emails),
    financingTypeLabel: row.financing_type ? FINANCING_TYPE_LABELS[row.financing_type] : EMPTY,
    institutionLabel: row.financial_institution?.trim() || EMPTY,
    originLabel: row.source ? SOURCE_LABELS[row.source] : EMPTY,
    campaignLabel: row.campaign_name?.trim() || EMPTY,
    formLabel: row.form_name?.trim() || EMPTY,
    arrivedAt: row.arrived_at,
    markers: markersFor({ missing_phone: row.missing_phone }, row.reviews)
  };
}

function primaryContact(phones: readonly string[], emails: readonly string[]): string {
  if (phones.length > 0) {
    return phones[0] as string;
  }
  if (emails.length > 0) {
    return emails[0] as string;
  }
  return EMPTY;
}

/**
 * DD/MM/YYYY HH:mm, in the workspace's default timezone (CONTEXT.md
 * "Workspace"). Assembled from `formatToParts` rather than trusting the
 * locale's default literal separators, which vary by ICU version (some emit
 * a comma between date and time for `pt-BR`).
 */
export function formatArrivedAt(value: Date): string {
  const parts = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((candidate) => candidate.type === type)?.value ?? "";
  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}

/**
 * R$ 1.234,56 — the same decimal `normalizeDecimalAmount` produces, dressed
 * for reading. Built by hand instead of `Intl.NumberFormat`'s `currency`
 * style, which inserts a non-breaking space whose exact codepoint is an ICU
 * implementation detail, not something this screen should assert on.
 */
export function formatInstallmentAmount(value: string | null): string {
  if (value === null) {
    return EMPTY;
  }
  const amount = Number.parseFloat(value);
  if (Number.isNaN(amount)) {
    return EMPTY;
  }
  const formatted = amount.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  });
  return `R$ ${formatted}`;
}
