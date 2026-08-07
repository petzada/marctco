import { z } from "zod";

/**
 * The canonical `v1` entry contract (ADR-0008). The CRM publishes it and every
 * origin maps onto it — there is no "native Pluga payload" to receive, because
 * Pluga's HTTP Request tool sends whatever JSON the user typed into it, with no
 * envelope of its own.
 *
 * Two rules shape everything below:
 *
 * - **Zod is the single source.** The TypeScript type is inferred, never
 *   written by hand alongside it, so the shape cannot drift from the validator.
 * - **The parser is tolerant.** No business field is required, unknown
 *   properties do not break processing, and a field that arrives in the wrong
 *   shape degrades to absent instead of rejecting the submission. A payload
 *   that already authenticated must never turn into a lost lead because one
 *   mapping cell in somebody's automation was wrong (ADR-0007).
 */

export const CONTRACT_VERSION = "v1";

/**
 * Where the submission came from. Half of the idempotency key
 * (`source` + `external_lead_id`, ADR-0007), which is why it is an enum and
 * not free text: a source that spells itself two ways deduplicates nothing.
 */
export const LEAD_SOURCES = ["META_LEAD_ADS", "GOOGLE_LEAD_FORM", "LANDING_PAGE"] as const;
export type LeadSource = (typeof LEAD_SOURCES)[number];

const KNOWN_SOURCES: ReadonlySet<string> = new Set(LEAD_SOURCES);

export function isLeadSource(value: unknown): value is LeadSource {
  return typeof value === "string" && KNOWN_SOURCES.has(value);
}

/**
 * IDs travel as strings, and an origin that sends a bare number is not a reason
 * to lose the lead. Booleans coerce too, because a mapping tool that fills a
 * text field from a checkbox is a mapping mistake, not a malformed request.
 */
const scalar = z.union([z.string(), z.number(), z.boolean()]);

const optionalText = scalar
  .transform((value) => {
    const text = String(value).trim();
    return text === "" ? undefined : text;
  })
  .optional()
  .catch(undefined);

const optionalTextList = z
  .union([scalar, z.array(z.unknown())])
  .transform((value) => {
    const items = Array.isArray(value) ? value : [value];
    const texts: string[] = [];
    for (const item of items) {
      if (typeof item !== "string" && typeof item !== "number") {
        continue;
      }
      const text = String(item).trim();
      if (text !== "") {
        texts.push(text);
      }
    }
    return texts;
  })
  .optional()
  .catch(undefined);

const optionalFlag = z
  .union([z.boolean(), z.string(), z.number()])
  .transform((value) => {
    if (typeof value === "boolean") {
      return value;
    }
    const text = String(value).trim().toLowerCase();
    if (text === "true" || text === "1" || text === "sim") {
      return true;
    }
    if (text === "false" || text === "0" || text === "nao" || text === "não") {
      return false;
    }
    return undefined;
  })
  .optional()
  .catch(undefined);

const optionalAnswers = z
  .record(z.string(), z.unknown())
  .transform((value) => {
    const answers: Record<string, string> = {};
    for (const [key, answer] of Object.entries(value)) {
      if (typeof answer === "string" || typeof answer === "number" || typeof answer === "boolean") {
        const text = String(answer).trim();
        if (text !== "") {
          answers[key] = text;
        }
      }
    }
    return answers;
  })
  .optional()
  .catch(undefined);

/**
 * What arrived on the wire, read as leniently as it can be read. Every field is
 * optional — including the two that the interpreted contract requires, because
 * supplying them when the origin does not is the connector's job (ADR-0008).
 *
 * Unknown properties are stripped here and survive where they matter: in
 * `IntegrationEvent.raw`, the single copy of the payload (ADR-0014). A future
 * version of the contract can start reading one without any old event losing it.
 */
const leadPayloadSchema = z
  .object({
    schema_version: optionalText,
    source: optionalText,
    external_lead_id: optionalText,
    occurred_at: optionalText,

    name: optionalText,
    // Both spellings, singular and plural. The plural is the published
    // contract; the singular is the shape somebody mapping one Meta form
    // question will reach for first, and refusing it would cost a lead to
    // teach a lesson about pluralisation.
    phone: optionalText,
    phones: optionalTextList,
    email: optionalText,
    emails: optionalTextList,
    cpf: optionalText,

    financing_type: optionalText,
    financial_institution: optionalText,
    installment_amount: optionalText,

    form_id: optionalText,
    form_name: optionalText,
    campaign_id: optionalText,
    campaign_name: optionalText,
    adset_id: optionalText,
    adset_name: optionalText,
    ad_id: optionalText,
    ad_name: optionalText,
    platform: optionalText,
    is_organic: optionalFlag,

    answers: optionalAnswers
  })
  // A body that is not even a JSON object still committed as an event and
  // still answered 200. It reads as a submission with nothing in it, which is
  // quarantine — a visible, completable record rather than a silent drop.
  .catch({});

/** Attribution travels together because it is read together, and never decides anything. */
const attributionSchema = z.object({
  form_id: z.string().nullable(),
  form_name: z.string().nullable(),
  campaign_id: z.string().nullable(),
  campaign_name: z.string().nullable(),
  adset_id: z.string().nullable(),
  adset_name: z.string().nullable(),
  ad_id: z.string().nullable(),
  ad_name: z.string().nullable(),
  platform: z.string().nullable(),
  is_organic: z.boolean().nullable()
});

/**
 * The interpreted `v1` contract: what a connector produces, and what the
 * "completar e liberar" form in `apps/web` produces directly from what a
 * manager typed while reading the raw payload (ADR-0017). Both reach
 * `normalize()` through this one type.
 *
 * Values here are still **raw text**: a phone is whatever the form collected,
 * not E.164. That is the whole point of two types — `normalize()` is what turns
 * this into a `NormalizedLead`, and the compiler is what proves it ran
 * (ADR-0008).
 */
export const inboundLeadSchema = z.object({
  schema_version: z.string(),
  source: z.enum(LEAD_SOURCES),
  external_lead_id: z.string().min(1),
  occurred_at: z.string().nullable(),

  name: z.string().nullable(),
  phones: z.array(z.string()).readonly(),
  emails: z.array(z.string()).readonly(),
  cpf: z.string().nullable(),

  financing_type: z.string().nullable(),
  financial_institution: z.string().nullable(),
  installment_amount: z.string().nullable(),

  attribution: attributionSchema,
  answers: z.record(z.string(), z.string()).readonly()
});

export type InboundLead = z.infer<typeof inboundLeadSchema>;

/**
 * What the wire read produced, before a connector has decided the two fields
 * that make a submission identifiable. `declared_source` is what the payload
 * *claimed*; whether to believe it is the connector's call, because only the
 * connector knows which connection the event came through.
 */
export interface LeadPayloadReading {
  readonly declared_source: LeadSource | null;
  readonly declared_external_lead_id: string | null;
  readonly fields: Omit<InboundLead, "source" | "external_lead_id">;
}

/**
 * Reads a raw payload. **Never throws** — every failure mode degrades to an
 * absent field, because this runs against JSON that a customer's automation
 * built and that the CRM already committed and acknowledged.
 */
export function readLeadPayload(raw: unknown): LeadPayloadReading {
  const payload = leadPayloadSchema.parse(raw);
  const declared = payload.source?.toUpperCase().replace(/[\s-]+/g, "_") ?? null;

  return {
    declared_source: isLeadSource(declared) ? declared : null,
    declared_external_lead_id: payload.external_lead_id ?? null,
    fields: {
      schema_version: payload.schema_version ?? CONTRACT_VERSION,
      occurred_at: payload.occurred_at ?? null,
      name: payload.name ?? null,
      phones: mergeContacts(payload.phone, payload.phones),
      emails: mergeContacts(payload.email, payload.emails),
      cpf: payload.cpf ?? null,
      financing_type: payload.financing_type ?? null,
      financial_institution: payload.financial_institution ?? null,
      installment_amount: payload.installment_amount ?? null,
      attribution: {
        form_id: payload.form_id ?? null,
        form_name: payload.form_name ?? null,
        campaign_id: payload.campaign_id ?? null,
        campaign_name: payload.campaign_name ?? null,
        adset_id: payload.adset_id ?? null,
        adset_name: payload.adset_name ?? null,
        ad_id: payload.ad_id ?? null,
        ad_name: payload.ad_name ?? null,
        platform: payload.platform ?? null,
        is_organic: payload.is_organic ?? null
      },
      answers: payload.answers ?? {}
    }
  };
}

/**
 * Completes a reading into an `InboundLead`. The two arguments are exactly the
 * two facts a connector knows and a payload may not: which origin this is, and
 * a stable id for this transmission.
 */
export function buildInboundLead(
  reading: LeadPayloadReading,
  identity: { readonly source: LeadSource; readonly external_lead_id: string }
): InboundLead {
  return inboundLeadSchema.parse({
    ...reading.fields,
    source: identity.source,
    external_lead_id: identity.external_lead_id
  });
}

function mergeContacts(
  singular: string | undefined,
  plural: readonly string[] | undefined
): readonly string[] {
  const merged: string[] = [];
  for (const value of [singular, ...(plural ?? [])]) {
    if (value !== undefined && !merged.includes(value)) {
      merged.push(value);
    }
  }
  return merged;
}
