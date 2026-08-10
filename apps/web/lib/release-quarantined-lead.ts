import {
  applyIntakePlan,
  findOpenOpportunitiesOfPerson,
  findPersonCandidates,
  getQuarantinedEvent,
  recordLeadSubmission,
  resolveIntakeDestination,
  type AppliedIntakePlan,
  type UserContext
} from "@marctco/db";
import {
  decideIntake,
  decidePersonIdentity,
  normalize,
  planPersonLookup,
  planSubmission,
  reusedPersonId
} from "@marctco/domain";
import { buildReleaseInboundLead, type QuarantineCompletionInput } from "./build-release-inbound-lead";

export interface ReleaseQuarantinedLeadInput {
  readonly integration_event_id: string;
  readonly completion: QuarantineCompletionInput;
}

/**
 * "Completar e liberar" — the literal same path as ingestion (ADR-0017),
 * called from the release route handler instead of the worker's job. Line
 * for line the same sequence as `apps/worker/src/integration-event-job.ts`'s
 * `processIntegrationEventJob`:
 *
 *   getQuarantinedEvent → buildReleaseInboundLead → normalize
 *     → recordLeadSubmission (phase two of ADR-0017: the insert's answer is
 *       an *input* of the decision, not an output of it)
 *     → findPersonCandidates → decidePersonIdentity
 *     → resolveIntakeDestination + findOpenOpportunitiesOfPerson (parallel,
 *       same as the worker)
 *     → decideIntake (now = the release instant, not received_at)
 *     → applyIntakePlan
 *
 * No connector runs here — `getQuarantinedEvent` reads the raw payload and a
 * human filled in the four contact fields who read it, not an adapter
 * interpreting an origin's shape (ADR-0008). No second `IntegrationEvent` is
 * created: `getQuarantinedEvent` returns the one that already exists, and
 * every call below carries its id forward (ADR-0014).
 */
export async function releaseQuarantinedLead(
  context: UserContext,
  input: ReleaseQuarantinedLeadInput,
  now: Date
): Promise<AppliedIntakePlan> {
  const quarantined = await getQuarantinedEvent(context, input.integration_event_id);

  const inbound = buildReleaseInboundLead(
    quarantined.raw,
    { source: quarantined.source, external_lead_id: quarantined.external_lead_id },
    input.completion
  );
  const normalized = normalize(inbound);

  const submission = await recordLeadSubmission(context, {
    key: planSubmission(inbound),
    integration_event_id: quarantined.integration_event_id,
    received_at: quarantined.received_at
  });

  const candidates = await findPersonCandidates(context, planPersonLookup(normalized));
  const person = decidePersonIdentity({ normalized, candidates });

  const [destination, open_opportunity_ids] = await Promise.all([
    resolveIntakeDestination(context, quarantined.target_pipeline_id),
    findOpenOpportunitiesOfPerson(context, reusedPersonId(person))
  ]);

  const plan = decideIntake({
    normalized,
    submission,
    person,
    destination,
    open_opportunity_ids,
    integration_event_id: quarantined.integration_event_id,
    now
  });

  return applyIntakePlan(context, plan);
}
