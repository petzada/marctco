import {
  createJobContext,
  findPersonCandidates,
  markIntegrationEventProcessed,
  readIntegrationEventForProcessing
} from "@marctco/db";
import {
  decidePersonIdentity,
  normalize,
  planPersonLookup,
  type IntegrationEventJobData,
  type PersonDecision
} from "@marctco/domain";
import { connectLeadSource } from "./connector-v1.js";

export interface ProcessedIntegrationEvent {
  readonly integration_event_id: string;
  readonly workspace_id: string;
  /**
   * Which *kind* of decision was reached, and deliberately not the decision
   * itself. BullMQ stores whatever a processor resolves as the job's
   * `returnvalue` in Redis, and a `PersonDecision` carries the submission's
   * name, phones, e-mails and CPF. Returning it would put a second copy of the
   * payload outside Postgres, outside RLS and outside the 90-day expiry — the
   * one copy rule of ADR-0014 broken by a convenience nobody needs, since the
   * decision's only consumer is the next line of this same function
   * (ADR-0006 regra 12).
   */
  readonly person_decision_kind: PersonDecision["kind"];
}

function assertJobData(data: unknown): asserts data is IntegrationEventJobData {
  if (typeof data !== "object" || data === null) {
    throw new Error("An integration event job must carry its identifiers");
  }
  const candidate = data as Record<string, unknown>;
  if (
    typeof candidate.integration_event_id !== "string" ||
    typeof candidate.workspace_id !== "string"
  ) {
    throw new Error("An integration event job must carry its identifiers");
  }
}

/**
 * Read the event under RLS, interpret it, and decide who it is.
 *
 * The tenant comes from the job, which the authenticated handler wrote. If the
 * event does not belong to that workspace the read returns zero rows and this
 * throws: a job that claims the wrong tenant must fail loudly, never quietly
 * succeed at nothing (ADR-0006).
 *
 * The worker sequences nothing it decides: the connector turns the payload into
 * an `InboundLead`, the domain normalizes it and says which keys to look up,
 * `packages/db` executes that lookup under the tenant, and the domain arbitrates
 * the result. Every rule lives in a pure function, and the worker only carries
 * values between them (ADR-0017).
 */
export async function processIntegrationEventJob(
  data: unknown
): Promise<ProcessedIntegrationEvent> {
  assertJobData(data);
  const context = createJobContext({
    workspace_id: data.workspace_id,
    integration_event_id: data.integration_event_id
  });

  const event = await readIntegrationEventForProcessing(context);
  const { inbound } = connectLeadSource({
    raw: event.raw,
    integration_event_id: event.id,
    provider: event.provider
  });
  const normalized = normalize(inbound);
  const candidates = await findPersonCandidates(context, planPersonLookup(normalized));
  // Stays local. Ticket 09 feeds it straight into `decideIntake` a few lines
  // below this one; it has no reason to travel anywhere else.
  const person_decision = decidePersonIdentity({ normalized, candidates });

  if (event.status !== "PROCESSED") {
    await markIntegrationEventProcessed(context);
  }

  return {
    integration_event_id: data.integration_event_id,
    workspace_id: data.workspace_id,
    person_decision_kind: person_decision.kind
  };
}
