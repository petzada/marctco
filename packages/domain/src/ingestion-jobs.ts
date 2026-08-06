export const INTEGRATION_EVENT_QUEUE = "integration-events";
export const INTEGRATION_EVENT_JOB = "integration-event";

/**
 * Everything a job is allowed to carry: identifiers and the tenant the
 * authenticated handler resolved. Never the payload — `raw` holds CPF and
 * phone numbers, and the worker reads it from PostgreSQL under RLS instead
 * (ADR-0007).
 */
export interface IntegrationEventJobData {
  readonly integration_event_id: string;
  readonly workspace_id: string;
}

/**
 * Derived from the event id and nothing else. A deterministic id is what makes
 * republication safe: the dispatcher may publish an event twice — after a
 * Redis outage, or from two replicas — and BullMQ keeps one job.
 *
 * The separator is a hyphen because BullMQ refuses a custom id containing `:`,
 * which is its own key separator.
 */
export function integrationEventJobId(integration_event_id: string): string {
  return `${INTEGRATION_EVENT_JOB}-${integration_event_id}`;
}
