import {
  buildInboundLead,
  readLeadPayload,
  type InboundLead,
  type LeadSource
} from "@marctco/domain";
import type { IntegrationProvider } from "@marctco/db";

/**
 * The `v1` connector — the `LeadSourceConnector` of ADR-0008 — and it lives in
 * the worker on purpose.
 *
 * The request handler authenticates, commits the raw payload and answers 200
 * without interpreting anything (ADR-0007). Interpretation happens here,
 * later, so that when a connector turns out to have a bug the payload is still
 * on disk **uninterpreted** and the event can be reprocessed with the fixed
 * code. If this ran in the request, a parsing bug would lose the lead
 * irrecoverably. That is counter-intuitive enough that somebody will one day
 * try to "fix" it by parsing in the handler; it is not a bug, it is the design.
 *
 * The connector knows the **shape** an origin sends and the two facts a payload
 * may not carry — which origin this is and a stable id for the transmission.
 * It knows nothing about pipelines, Person or Opportunity, and it normalizes
 * nothing: the default country for a phone number is domain knowledge, and
 * copying it in here is how three adapters end up disagreeing.
 */

export interface ConnectV1Input {
  /** `IntegrationEvent.raw`, exactly as it was committed. */
  readonly raw: unknown;
  readonly integration_event_id: string;
  /** Which connection the event arrived through. */
  readonly provider: IntegrationProvider;
}

export interface ConnectedLead {
  readonly inbound: InboundLead;
  /**
   * True when the origin gave no id of its own and the `IntegrationEvent.id`
   * was used instead. Worth reporting: two POSTs from a landing page with no id
   * become two submissions, which is the visible-duplicate trade this design
   * makes everywhere (ADR-0007 §Mecanismo 1).
   */
  readonly synthesized_external_lead_id: boolean;
  /** False when the origin was inferred from the connection rather than declared. */
  readonly declared_source: boolean;
}

/**
 * What a connection means when the payload says nothing. A landing page speaks
 * for itself; a Pluga connection in this slice is a Meta Lead Ads automation,
 * and Google arrives with ticket 13 declaring `source` explicitly — which is
 * why the published mapping template puts `source` in it.
 */
const PROVIDER_DEFAULT_SOURCE: Readonly<Record<IntegrationProvider, LeadSource>> = {
  PLUGA: "META_LEAD_ADS",
  LANDING_PAGE: "LANDING_PAGE"
};

export function connectV1(input: ConnectV1Input): ConnectedLead {
  if (typeof input.integration_event_id !== "string" || input.integration_event_id === "") {
    throw new Error("A v1 connector needs the id of the event it is interpreting");
  }

  const reading = readLeadPayload(input.raw);
  const source = reading.declared_source ?? PROVIDER_DEFAULT_SOURCE[input.provider];

  // The id the CRM minted when it received the request: no clock inside it,
  // unique per request, and identical on every reprocessing of the same event.
  // That last property is the whole point — an event republished after Redis
  // came back must produce the same idempotency key, not a second lead
  // (ADR-0007 §Mecanismo 1).
  const external_lead_id = reading.declared_external_lead_id ?? input.integration_event_id;

  return {
    inbound: buildInboundLead(reading, { source, external_lead_id }),
    synthesized_external_lead_id: reading.declared_external_lead_id === null,
    declared_source: reading.declared_source !== null
  };
}
