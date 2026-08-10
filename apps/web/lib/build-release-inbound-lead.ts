import { buildInboundLead, readLeadPayload, type InboundLead, type LeadSource } from "@marctco/domain";

/**
 * The four `v1` fields a manager types while reading the raw payload beside
 * the form — exactly the fields ADR-0017 names for "completar e liberar".
 */
export interface QuarantineCompletionInput {
  readonly name: string;
  readonly phone: string;
  readonly email: string;
  readonly cpf: string;
}

export interface ReleaseIdentity {
  readonly source: LeadSource;
  readonly external_lead_id: string;
}

/**
 * Produces `InboundLead` directly from a human's input — no connector, no
 * origin shape to interpret (ADR-0008, ADR-0017). `source` and
 * `external_lead_id` are preserved from the original submission, never
 * re-declared by the form. Everything else that arrived correctly —
 * attribution, financing data, `occurred_at` — is carried over from the raw
 * payload via the same contract-level reader the worker's connector uses
 * (`readLeadPayload`, not the connector itself); only the four contact
 * fields the manager typed replace what the mapping lost, because that loss
 * is the entire reason the lead is in quarantine.
 */
export function buildReleaseInboundLead(
  raw: unknown,
  identity: ReleaseIdentity,
  completion: QuarantineCompletionInput
): InboundLead {
  const reading = readLeadPayload(raw);
  return buildInboundLead(
    {
      ...reading,
      fields: {
        ...reading.fields,
        name: emptyToNull(completion.name),
        phones: nonEmptyList(completion.phone),
        emails: nonEmptyList(completion.email),
        cpf: emptyToNull(completion.cpf)
      }
    },
    identity
  );
}

function emptyToNull(value: string): string | null {
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function nonEmptyList(value: string): readonly string[] {
  const trimmed = value.trim();
  return trimmed === "" ? [] : [trimmed];
}
