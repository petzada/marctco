import {
  createJobContext,
  markIntegrationEventProcessed,
  readIntegrationEventForProcessing
} from "@marctco/db";
import type { IntegrationEventJobData } from "@marctco/domain";

export interface ProcessedIntegrationEvent {
  readonly integration_event_id: string;
  readonly workspace_id: string;
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
 * The worker's whole job in this ticket: read the event under RLS and close
 * it. Nothing is interpreted yet — no Person, no Opportunity, no
 * normalization. What is proved here is the plumbing.
 *
 * The tenant comes from the job, which the authenticated handler wrote. If the
 * event does not belong to that workspace the read returns zero rows and this
 * throws: a job that claims the wrong tenant must fail loudly, never quietly
 * succeed at nothing (ADR-0006).
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
  if (event.status !== "PROCESSED") {
    await markIntegrationEventProcessed(context);
  }

  return {
    integration_event_id: data.integration_event_id,
    workspace_id: data.workspace_id
  };
}
