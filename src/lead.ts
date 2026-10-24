// Formulário de contato: campos, validação e normalização. O mesmo código roda no
// navegador (antes de enviar) e no Worker (antes de gravar no D1).

export type LeadField = "nome" | "whatsapp" | "empresa" | "ramo" | "produto";

export interface FieldSpec {
  name: LeadField;
  label: string;
  placeholder: string;
  autocomplete: string;
  type: "text" | "tel";
  maxLength: number;
}

export const LEAD_FIELDS: readonly FieldSpec[] = [
  { name: "nome", label: "Nome", placeholder: "Seu nome", autocomplete: "name", type: "text", maxLength: 80 },
  {
    name: "whatsapp",
    label: "WhatsApp de contato",
    placeholder: "(11) 90000-0000",
    autocomplete: "tel-national",
    type: "tel",
    maxLength: 20,
  },
  { name: "empresa", label: "Nome da empresa", placeholder: "Nome do negócio", autocomplete: "organization", type: "text", maxLength: 100 },
  { name: "ramo", label: "Ramo da empresa", placeholder: "Ex.: padaria, salão, oficina", autocomplete: "off", type: "text", maxLength: 80 },
  { name: "produto", label: "Produto principal", placeholder: "O que você mais vende", autocomplete: "off", type: "text", maxLength: 120 },
];

export interface Lead extends Record<LeadField, string> {
  /** Seção do site em que o botão foi clicado (hero, gmb, …). */
  origem: string;
}

export type LeadResult = { ok: true; lead: Lead } | { ok: false; errors: Partial<Record<LeadField, string>> };

const ORIGIN_PATTERN = /^[a-z]{2,10}$/;

/** Só dígitos; aceita com ou sem o 55 e devolve no formato 55 + DDD + número. */
export function normalizeWhatsapp(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  const national = digits.length >= 12 && digits.startsWith("55") ? digits.slice(2) : digits;
  // DDD (2) + fixo (8) ou celular (9)
  return /^[1-9]{2}9?\d{8}$/.test(national) ? `55${national}` : null;
}

// Troca caracteres de controle (quebras, tabs, nulos) por espaço antes de gravar
const CONTROL = /[\u0000-\u001f\u007f]/g; // oxlint-disable-line no-control-regex
const clean = (value: unknown) =>
  typeof value === "string" ? value.replace(CONTROL, " ").replace(/\s+/g, " ").trim() : "";

export function validateLead(input: Record<string, unknown>): LeadResult {
  const errors: Partial<Record<LeadField, string>> = {};
  const values = {} as Record<LeadField, string>;
  for (const field of LEAD_FIELDS) {
    const value = clean(input[field.name]);
    if (!value) errors[field.name] = "Preencha este campo";
    else if (value.length > field.maxLength) errors[field.name] = `Use até ${field.maxLength} caracteres`;
    values[field.name] = value;
  }
  if (values.whatsapp && !errors.whatsapp) {
    const phone = normalizeWhatsapp(values.whatsapp);
    if (phone) values.whatsapp = phone;
    else errors.whatsapp = "Informe DDD e número";
  }
  if (Object.keys(errors).length) return { ok: false, errors };
  const origem = clean(input.origem);
  return { ok: true, lead: { ...values, origem: ORIGIN_PATTERN.test(origem) ? origem : "site" } };
}
