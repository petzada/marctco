import {
  claimPendingChannelAttempts,
  createJobContext,
  dispatchChannelOutboundAttempt,
  type PendingChannelAttempt
} from "@marctco/db";
import { channelOutboundJobId, type ChannelOutboundJobData } from "@marctco/domain";
import { logger } from "./logger";

export const DISPATCH_BATCH_SIZE = 50;
export const DEFAULT_DISPATCH_INTERVAL_MS = 2_000;
const MINIMUM_DISPATCH_INTERVAL_MS = 250;
export const MAX_DISPATCH_BACKOFF_MS = 300_000;

export function dispatchIntervalMs(configured: string | undefined): number {
  if (configured === undefined) {
    return DEFAULT_DISPATCH_INTERVAL_MS;
  }
  const interval_ms = Number.parseInt(configured, 10);
  if (!Number.isInteger(interval_ms) || interval_ms < MINIMUM_DISPATCH_INTERVAL_MS) {
    throw new Error(
      `CHANNEL_DISPATCH_INTERVAL_MS must be an integer of at least ${MINIMUM_DISPATCH_INTERVAL_MS}`
    );
  }
  return interval_ms;
}

export function nextDispatchDelayMs(
  consecutive_failed_passes: number,
  base_interval_ms: number = DEFAULT_DISPATCH_INTERVAL_MS
): number {
  if (consecutive_failed_passes <= 0) {
    return base_interval_ms;
  }
  const exponent = Math.min(consecutive_failed_passes, 30);
  return Math.min(base_interval_ms * 2 ** exponent, MAX_DISPATCH_BACKOFF_MS);
}

export interface ChannelJobPublisher {
  publish(job_id: string, data: ChannelOutboundJobData): Promise<void>;
}

export interface DispatchOutcome {
  readonly claimed: number;
  readonly dispatched: number;
}

export function dispatchPassFailed(outcome: DispatchOutcome): boolean {
  return outcome.claimed > 0 && outcome.dispatched === 0;
}

/**
 * One pass of the channel outbox: claim pending or expired-lease attempts,
 * publish, and only then mark DISPATCHED. Redis down leaves the row pending
 * so the next pass can recover without a second logical send (ADR-0007).
 *
 * Publish happens outside any transaction.
 */
export async function dispatchPendingChannelAttempts(
  publisher: ChannelJobPublisher,
  batch_size: number = DISPATCH_BATCH_SIZE
): Promise<DispatchOutcome> {
  const pending: PendingChannelAttempt[] = await claimPendingChannelAttempts(batch_size);
  let dispatched = 0;

  for (const attempt of pending) {
    const data: ChannelOutboundJobData = {
      attempt_id: attempt.attempt_id,
      workspace_id: attempt.workspace_id
    };
    try {
      await publisher.publish(channelOutboundJobId(attempt.attempt_id), data);
    } catch (error: unknown) {
      logger.warn({
        event: "channel_outbound_dispatch",
        result: "publish_failed",
        workspace_id: attempt.workspace_id,
        attempt_id: attempt.attempt_id,
        error
      });
      continue;
    }

    await dispatchChannelOutboundAttempt(
      createJobContext({
        workspace_id: attempt.workspace_id,
        origin: { type: "channel_outbound", attempt_id: attempt.attempt_id }
      })
    );
    dispatched += 1;
  }

  if (pending.length > 0) {
    logger.info({
      event: "channel_outbound_dispatch",
      result: "pass_complete",
      claimed: pending.length,
      dispatched
    });
  }
  return { claimed: pending.length, dispatched };
}
