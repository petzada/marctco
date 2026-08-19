import { normalizeCpf } from "./cpf.js";
import { normalizeEmail } from "./email.js";
import { normalizeDecimalAmount } from "./money.js";
import { readPhone } from "./phone.js";
import type { InboundLead, LeadSource } from "./inbound-lead.js";

/**
 * `InboundLead` → `normalize()` → `NormalizedLead`. Two types and not one, so
 * the compiler — not a convention somebody has to remember — is what proves the
 * normalization happened (ADR-0008). A single type that the connector filled in
 * "already normalized" would say `normalized` and hold a phone with parentheses
 * in it, and the defect would surface weeks later as a crooked number on a card.
 *
 * `NormalizedLead` is a **value object**: no identity, no lifecycle. The
 * entities are `Person` and `Opportunity`.
 */

/**
 * The four financing types (ADR-0005). Classification only: it never selects a
 * pipeline and never identifies a Pessoa (ADR-0007 §Mecanismo 2).
 */
export const FINANCING_TYPES = ["VEHICLE", "REAL_ESTATE", "PERSONAL_LOAN", "OTHER"] as const;
export type FinancingType = (typeof FINANCING_TYPES)[number];

/**
 * The code value, plus the PT-BR term the glossary itself uses for it
 * (`CONTEXT.md` §Tipo de financiamento, ADR-0005). Nothing wider: a synonym
 * table is a product decision in disguise, and every word not in the glossary
 * would be one taken here with no source — "consignado", for one, is a
 * different product from an empréstimo pessoal to everybody who sells either.
 *
 * A word outside this map produces a diagnostic and a null type. That costs
 * nothing: the financing type is optional, never selects a pipeline, and never
 * identifies a Pessoa (ADR-0007 §Mecanismo 2).
 */
const FINANCING_TYPE_SYNONYMS: ReadonlyMap<string, FinancingType> = new Map([
  ["VEHICLE", "VEHICLE"],
  ["VEICULO", "VEHICLE"],
  ["REAL_ESTATE", "REAL_ESTATE"],
  ["IMOVEL", "REAL_ESTATE"],
  ["PERSONAL_LOAN", "PERSONAL_LOAN"],
  ["EMPRESTIMO_PESSOAL", "PERSONAL_LOAN"],
  ["OTHER", "OTHER"],
  ["OUTRO", "OTHER"]
]);

/**
 * Why a field did not survive normalization. It carries **no value** — only
 * which field and why — because a diagnostic is the one part of a submission
 * that leaves the tenant, and the payload holds CPF and phone numbers
 * (ADR-0006 regra 12). Whoever needs the content reads it in Integrações,
 * under RLS, inside the workspace.
 */
export interface NormalizationDiagnostic {
  readonly field: string;
  readonly reason:
    | "NOT_A_PHONE"
    | "NOT_A_PERSONAL_PHONE"
    | "NOT_AN_EMAIL"
    | "NOT_A_VALID_CPF"
    | "NOT_AN_AMOUNT"
    | "NOT_AN_INSTANT"
    | "UNKNOWN_FINANCING_TYPE";
}

export interface NormalizedLead {
  readonly source: LeadSource;
  readonly external_lead_id: string;
  /** When the origin says the lead was created. Never the CRM's own clock. */
  readonly occurred_at: Date | null;

  readonly name: string | null;
  /** E.164, in the order received, without repeats. Multiple values survive. */
  readonly phones: readonly string[];
  /** Lowercase, in the order received, without repeats. */
  readonly emails: readonly string[];
  /** Digits only, check digits verified. Null when absent *or* invalid. */
  readonly cpf: string | null;

  readonly financing_type: FinancingType | null;
  readonly financial_institution: string | null;
  /** Canonical decimal string, never a float. */
  readonly installment_amount: string | null;
  /** Exactly what arrived, so a wrong reading stays recoverable by a human. */
  readonly installment_amount_raw: string | null;

  readonly attribution: InboundLead["attribution"];
  readonly answers: InboundLead["answers"];
  /** Copied from the `v1` contract. Not inferred during normalization. */
  readonly whatsapp_opt_in: boolean | null;

  readonly diagnostics: readonly NormalizationDiagnostic[];
}

export function normalize(inbound: InboundLead): NormalizedLead {
  const diagnostics: NormalizationDiagnostic[] = [];

  const phones = normalizeContacts(inbound.phones, "phones", (value) => {
    const reading = readPhone(value);
    return reading.kind === "E164" ? { value: reading.value } : { reason: reading.kind };
  });
  const emails = normalizeContacts(inbound.emails, "emails", (value) => {
    const email = normalizeEmail(value);
    return email === null ? { reason: "NOT_AN_EMAIL" } : { value: email };
  });
  diagnostics.push(...phones.diagnostics, ...emails.diagnostics);

  const cpf = normalizeCpf(inbound.cpf);
  if (inbound.cpf !== null && cpf === null) {
    // Not "the CPF is missing" — the CPF that arrived is not one. Recording the
    // difference is what lets a manager tell a form that never asks for CPF
    // from a form whose mapping is feeding it the wrong column.
    diagnostics.push({ field: "cpf", reason: "NOT_A_VALID_CPF" });
  }

  const installment_amount = normalizeDecimalAmount(inbound.installment_amount);
  if (inbound.installment_amount !== null && installment_amount === null) {
    diagnostics.push({ field: "installment_amount", reason: "NOT_AN_AMOUNT" });
  }

  const financing_type = normalizeFinancingType(inbound.financing_type);
  if (inbound.financing_type !== null && financing_type === null) {
    diagnostics.push({ field: "financing_type", reason: "UNKNOWN_FINANCING_TYPE" });
  }

  const occurred_at = normalizeInstant(inbound.occurred_at);
  if (inbound.occurred_at !== null && occurred_at === null) {
    // Pluga offers the same timestamp in ISO, DD/MM/YY and MM/DD/YYYY, and the
    // last two are indistinguishable from each other for the first twelve days
    // of any month. Only the ISO variant is read; guessing would silently date
    // a lead months away (ADR-0008).
    diagnostics.push({ field: "occurred_at", reason: "NOT_AN_INSTANT" });
  }

  return {
    source: inbound.source,
    external_lead_id: inbound.external_lead_id,
    occurred_at,
    name: emptyToNull(inbound.name),
    phones: phones.values,
    emails: emails.values,
    cpf,
    financing_type,
    financial_institution: emptyToNull(inbound.financial_institution),
    installment_amount,
    installment_amount_raw: inbound.installment_amount,
    attribution: inbound.attribution,
    answers: inbound.answers,
    whatsapp_opt_in: inbound.whatsapp_opt_in,
    diagnostics
  };
}

type ContactReading =
  | { readonly value: string }
  | { readonly reason: NormalizationDiagnostic["reason"] };

/**
 * Every value is kept, not just the first: a person who filled in a mobile and
 * a landline has two ways to be reached and two ways to be recognised later
 * (ADR-0007 §Identidade). Repeats collapse, because the same number written
 * two ways is one number once it is in E.164.
 *
 * The reader says why a value did not survive, so the reason is the reader's
 * to know rather than something the caller declares up front for the whole
 * list — which is what let a toll-free number be filed as "not a phone".
 */
function normalizeContacts(
  values: readonly string[],
  field: string,
  read: (value: string) => ContactReading
): { readonly values: readonly string[]; readonly diagnostics: readonly NormalizationDiagnostic[] } {
  const normalized: string[] = [];
  const diagnostics: NormalizationDiagnostic[] = [];
  for (const [index, value] of values.entries()) {
    const reading = read(value);
    if (!("value" in reading)) {
      diagnostics.push({ field: `${field}[${index}]`, reason: reading.reason });
      continue;
    }
    if (!normalized.includes(reading.value)) {
      normalized.push(reading.value);
    }
  }
  return { values: normalized, diagnostics };
}

function normalizeFinancingType(value: string | null): FinancingType | null {
  if (value === null) {
    return null;
  }
  const key = value
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/[\s-]+/g, "_");
  return FINANCING_TYPE_SYNONYMS.get(key) ?? null;
}

/** ISO 8601 only. See the diagnostic above for why the other variants are refused. */
function normalizeInstant(value: string | null): Date | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}([T ]\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/.test(trimmed)) {
    return null;
  }
  const instant = new Date(trimmed.replace(" ", "T"));
  return Number.isNaN(instant.getTime()) ? null : instant;
}

function emptyToNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}
