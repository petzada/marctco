import {
  createJobContext,
  decideAndApplyIntake,
  getWorkspaceSettings,
  readWorkspaceFeatureFlags,
  readIntegrationEventForProcessing,
  recordLeadSubmission,
  resolveIntakeDestination
} from "@marctco/db";
import {
  normalize,
  planSubmission,
  type IntakePlan,
  type IntegrationEventJobData
} from "@marctco/domain";
import {
  planOpportunityPostCreationEffects,
  type OpportunityPostCreationEffect
} from "@marctco/domain/feature-flags";
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
  /** Planned on the server and intentionally has no consumer in this slice. */
  readonly post_creation_effects: readonly OpportunityPostCreationEffect[];
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
 * says what makes the submission idempotent; `packages/db` records it under
 * the tenant, then coordinates `planPersonLookup → decideIntake →
 * applyIntakePlan` under deterministic transaction locks. Every rule remains
 * in a pure function, and this function only carries values between the named
 * operations (ADR-0017).
 *
 * `now` is `received_at`, the instant the lead actually arrived — never this
 * process's clock, which would date every lead by however long the queue was
 * down. The release handler in `apps/web` calls the same
 * `decideAndApplyIntake` with the instant of the release instead (ADR-0007
 * §Mecanismo 2).
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
      intake_plan_kind: null,
      post_creation_effects: []
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
    received_at: event.received_at,
    whatsapp_opt_in: inbound.whatsapp_opt_in
  });

  const destination = await resolveIntakeDestination(context, event.target_pipeline_id);
  const decided_and_applied = await decideAndApplyIntake(context, {
    normalized,
    submission,
    destination,
    integration_event_id: event.id,
    now: event.received_at
  });
  const { applied } = decided_and_applied;
  const post_creation_effects =
    applied.kind === "NEW_OPPORTUNITY"
      ? await planArrivalFirstContact({
          context,
          created_opportunity_id: applied.opportunity_id
        })
      : [];

  return {
    integration_event_id: data.integration_event_id,
    workspace_id: data.workspace_id,
    intake_plan_kind: decided_and_applied.intake_plan_kind,
    post_creation_effects
  };
}

/**
 * Arrival hook only. Reads the flag first so a workspace that never paid for
 * the capability does not pay for a settings round-trip. The default trigger
 * is ON_ASSIGNMENT, so this emits nothing until the workspace chose ON_ARRIVAL.
 */
async function planArrivalFirstContact(input: {
  readonly context: Parameters<typeof readWorkspaceFeatureFlags>[0];
  readonly created_opportunity_id: string;
}): Promise<readonly OpportunityPostCreationEffect[]> {
  const feature_flags = await readWorkspaceFeatureFlags(input.context);
  if (!feature_flags.auto_primeiro_contato) {
    return [];
  }
  const settings = await getWorkspaceSettings(input.context);
  return planOpportunityPostCreationEffects({
    feature_flags,
    first_contact_trigger: settings.first_contact_trigger,
    created_opportunity_id: input.created_opportunity_id
  });
}
