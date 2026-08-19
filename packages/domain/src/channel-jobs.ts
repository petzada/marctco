/**
 * Dedicated BullMQ queue for automatic first-contact WhatsApp. The job
 * carries identifiers only; the worker reads the attempt under RLS
 * (ADR-0007, ADR-0016).
 */

export const CHANNEL_OUTBOUND_QUEUE = "channel-outbound";
export const CHANNEL_OUTBOUND_JOB = "channel-outbound";

/** Anti-ban delay happens in the queue, before HTTP, so SENT cannot precede send. */
export const CHANNEL_OUTBOUND_INITIAL_DELAY_MS = 30_000;

/** Local mitigation: 6 sends per minute per workspace, not a provider limit. */
export const CHANNEL_OUTBOUND_RATE_LIMIT_MAX = 6;
export const CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS = 60_000;

/**
 * Everything a channel job is allowed to carry. Never a phone, template or
 * apikey — the worker reads those from PostgreSQL under the tenant.
 */
export interface ChannelOutboundJobData {
  readonly attempt_id: string;
  readonly workspace_id: string;
}

/**
 * Derived from the attempt id and nothing else. Republication after a Redis
 * outage or a second dispatcher replica keeps one BullMQ job.
 *
 * The separator is a hyphen because BullMQ refuses a custom id containing `:`.
 */
export function channelOutboundJobId(attempt_id: string): string {
  return `${CHANNEL_OUTBOUND_JOB}-${attempt_id}`;
}
