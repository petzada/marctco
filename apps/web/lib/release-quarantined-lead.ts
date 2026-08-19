import {
  decideAndApplyIntake,
  getQuarantinedEvent,
  recordLeadSubmission,
  resolveIntakeDestination,
  type AppliedIntakePlan,
  type UserContext
} from "@marctco/db";
import { normalize, planSubmission } from "@marctco/domain";
import { buildReleaseInboundLead, type QuarantineCompletionInput } from "./build-release-inbound-lead";

export interface ReleaseQuarantinedLeadInput {
  readonly integration_event_id: string;
  readonly completion: QuarantineCompletionInput;
}

/**
 * "Completar e liberar" — the same named operations as the worker's job
 * (ADR-0017), called from the release route handler. The connector is the
 * only difference: here a human typed the four contact fields while reading
 * the raw payload (ADR-0008). Sequence:
 *
 *   getQuarantinedEvent → buildReleaseInboundLead → normalize
 *     → recordLeadSubmission (phase two: the insert's answer is an *input*
 *       of the decision, not an output of it)
 *     → resolveIntakeDestination
 *     → decideAndApplyIntake (now = the release instant, not received_at).
 *       That named operation records the arrival-channel attempt in the same
 *       transaction that creates the Opportunity; this adapter does not import
 *       the feature-flag catalog.
 *
 * No second IntegrationEvent is created: `getQuarantinedEvent` returns the
 * one that already exists, and every call below carries its id forward
 * (ADR-0014).
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
    received_at: quarantined.received_at,
    whatsapp_opt_in: inbound.whatsapp_opt_in
  });

  const destination = await resolveIntakeDestination(context, quarantined.target_pipeline_id);
  const { applied } = await decideAndApplyIntake(context, {
    normalized,
    submission,
    destination,
    integration_event_id: quarantined.integration_event_id,
    now
  });
  return applied;
}
