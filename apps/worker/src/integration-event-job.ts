import {
  applyIntakePlan,
  createJobContext,
  findOpenOpportunitiesOfPerson,
  findPersonCandidates,
  readIntegrationEventForProcessing,
  recordLeadSubmission,
  resolveIntakeDestination
} from "@marctco/db";
import {
  decideIntake,
  decidePersonIdentity,
  normalize,
  planPersonLookup,
  planSubmission,
  reusedPersonId,
  type IntakePlan,
  type IntegrationEventJobData
} from "@marctco/domain";
import { connectLeadSource } from "./connector-v1.js";

export interface ProcessedIntegrationEvent {
  readonly integration_event_id: string;
  readonly workspace_id: string;
  /**
   * Which *kind* of plan was applied, and deliberately not the plan itself.
   * BullMQ stores whatever a processor resolves as the job's `returnvalue` in
   * Redis, and an `IntakePlan` carries the submission's name, phones, e-mails
   * and CPF. Returning it would put a second copy of the payload outside
   * Postgres, outside RLS and outside the 90-day expiry — the one-copy rule of
   * ADR-0014 broken by a convenience nobody needs, since the plan's only
   * consumer is the next line of this same function (ADR-0006 regra 12).
   *
   * Null when there was nothing to apply: an event republished after it was
   * already processed.
   */
  readonly intake_plan_kind: IntakePlan["kind"] | null;
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
 * Read the event under RLS, interpret it, decide, and apply the decision.
 *
 * The tenant comes from the job, which the authenticated handler wrote. If the
 * event does not belong to that workspace every read returns zero rows and this
 * throws: a job that claims the wrong tenant must fail loudly, never quietly
 * succeed at nothing (ADR-0006).
 *
 * The worker sequences nothing it decides. The connector turns the payload into
 * an `InboundLead`; the domain normalizes it, names the idempotency key and
 * says which keys to look up; `packages/db` executes those reads and the insert
 * under the tenant; the domain arbitrates the results into an `IntakePlan`; and
 * `applyIntakePlan` writes it in one transaction. Every rule lives in a pure
 * function, and this function only carries values between them (ADR-0017).
 *
 * `now` is `received_at`, the instant the lead actually arrived — never this
 * process's clock, which would date every lead by however long the queue was
 * down. The release handler in `apps/web` calls the same `decideIntake` with
 * the instant of the release instead (ADR-0007 §Mecanismo 2).
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
  if (event.status === "PROCESSED") {
    // Republication after Redis came back, or a retry of a job that already
    // finished. The submission constraint would catch it a step later anyway;
    // stopping here spends nothing at all on it.
    return {
      integration_event_id: data.integration_event_id,
      workspace_id: data.workspace_id,
      intake_plan_kind: null
    };
  }

  const { inbound } = connectLeadSource({
    raw: event.raw,
    integration_event_id: event.id,
    provider: event.provider
  });
  const normalized = normalize(inbound);

  // Phase two of ADR-0017, and the reason there are three phases: the insert's
  // answer is an *input* of the decision below, not an output of it.
  const submission = await recordLeadSubmission(context, {
    key: planSubmission(inbound),
    integration_event_id: event.id,
    received_at: event.received_at
  });

  const candidates = await findPersonCandidates(context, planPersonLookup(normalized));
  const person = decidePersonIdentity({ normalized, candidates });

  const [destination, open_opportunity_ids] = await Promise.all([
    resolveIntakeDestination(context, event.target_pipeline_id),
    findOpenOpportunitiesOfPerson(context, reusedPersonId(person))
  ]);

  const plan = decideIntake({
    normalized,
    submission,
    person,
    destination,
    open_opportunity_ids,
    integration_event_id: event.id,
    now: event.received_at
  });
  await applyIntakePlan(context, plan);

  return {
    integration_event_id: data.integration_event_id,
    workspace_id: data.workspace_id,
    intake_plan_kind: plan.kind
  };
}
