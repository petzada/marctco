import {
  CHANNEL_OUTBOUND_INITIAL_DELAY_MS,
  CHANNEL_OUTBOUND_JOB,
  CHANNEL_OUTBOUND_QUEUE
} from "@marctco/domain";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  dispatchIntervalMs,
  dispatchPassFailed,
  dispatchPendingChannelAttempts,
  nextDispatchDelayMs,
  type ChannelJobPublisher
} from "./channel-dispatcher";
import { logger } from "./logger";

const JOB_ATTEMPTS = 5;

export interface ChannelOutboundQueue {
  readonly publisher: ChannelJobPublisher;
  close(): Promise<void>;
}

/**
 * Dedicated channel queue. Delay is the anti-ban wait before HTTP. Attempts
 * recover only before sendText starts: the worker completes after a started
 * call so BullMQ never repeats it.
 */
export function createChannelOutboundQueue(
  redis_url = process.env.REDIS_URL
): ChannelOutboundQueue {
  if (!redis_url) {
    throw new Error("The channel dispatcher requires REDIS_URL");
  }

  const connection = new IORedis(redis_url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
  const queue = new Queue(CHANNEL_OUTBOUND_QUEUE, { connection });

  return {
    publisher: {
      async publish(job_id, data) {
        // Same recovery pattern as ingestion: a failed/completed job keeps its
        // id, so republication after a publish/mark split must drop the old
        // Redis entry before add. An active job stays locked and the add
        // deduplicates safely.
        await queue.remove(job_id).catch(() => undefined);
        await queue.add(CHANNEL_OUTBOUND_JOB, data, {
          jobId: job_id,
          delay: CHANNEL_OUTBOUND_INITIAL_DELAY_MS,
          attempts: JOB_ATTEMPTS,
          backoff: { type: "exponential", delay: 1_000 },
          removeOnComplete: { age: 86_400, count: 1_000 },
          removeOnFail: false
        });
      }
    },
    async close() {
      await queue.close();
      connection.disconnect();
    }
  };
}

export function startChannelOutboundDispatcher(): void {
  const interval_ms = dispatchIntervalMs(process.env.CHANNEL_DISPATCH_INTERVAL_MS);
  const { publisher } = createChannelOutboundQueue();
  const state = { consecutive_failed_passes: 0 };

  const schedule = (delay_ms: number): void => {
    setTimeout(runPass, delay_ms).unref();
  };

  function runPass(): void {
    void dispatchPendingChannelAttempts(publisher)
      .then((outcome) => {
        state.consecutive_failed_passes = dispatchPassFailed(outcome)
          ? state.consecutive_failed_passes + 1
          : 0;
      })
      .catch((error: unknown) => {
        state.consecutive_failed_passes += 1;
        logger.error({ event: "channel_outbound_dispatch", result: "pass_failed", error });
      })
      .finally(() => {
        const delay_ms = nextDispatchDelayMs(state.consecutive_failed_passes, interval_ms);
        if (state.consecutive_failed_passes > 0) {
          logger.warn({
            event: "channel_outbound_dispatch",
            result: "backing_off",
            consecutive_failed_passes: state.consecutive_failed_passes,
            next_pass_in_ms: delay_ms
          });
        }
        schedule(delay_ms);
      });
  }

  schedule(interval_ms);
  logger.info({ event: "channel_outbound_dispatch", result: "started" });
}
