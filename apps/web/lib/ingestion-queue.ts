import { INTEGRATION_EVENT_JOB, INTEGRATION_EVENT_QUEUE } from "@marctco/domain";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  dispatchIntervalMs,
  dispatchPassFailed,
  dispatchPendingIntegrationEvents,
  nextDispatchDelayMs,
  type JobPublisher
} from "./ingestion-dispatcher";
import { logger } from "./logger";

const JOB_ATTEMPTS = 5;

export interface IngestionQueue {
  readonly publisher: JobPublisher;
  close(): Promise<void>;
}

/**
 * Owns one BullMQ queue and hands back the narrow publisher the dispatcher
 * needs. It is a factory rather than a module-level singleton so nothing
 * mutable lives at module scope (ADR-0006 regra 11), and so a test can drive a
 * real queue without inheriting a process-wide connection.
 */
export function createIngestionQueue(redis_url = process.env.REDIS_URL): IngestionQueue {
  if (!redis_url) {
    throw new Error("The ingestion dispatcher requires REDIS_URL");
  }

  // The producer fails fast on purpose. BullMQ's `maxRetriesPerRequest: null`
  // is the right setting for a Worker — a command waits for the connection to
  // come back — but here it would make an outage look like a hung pass instead
  // of a refused publish, and a refused publish is exactly what leaves the
  // event pending for the next pass.
  const connection = new IORedis(redis_url, {
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
  const queue = new Queue(INTEGRATION_EVENT_QUEUE, { connection });

  return {
    publisher: {
      async publish(job_id, data) {
        // BullMQ refuses to add a job whose id already exists, and this id is
        // derived from the event on purpose — that is what makes a double
        // publish harmless. But a finished job keeps that id: completed ones
        // for a day, failed ones for good (`removeOnFail: false`, so the dead
        // letter stays inspectable). Without dropping the old one first,
        // "reprocessar" would flip `dispatch_status` back to PENDING, publish
        // into a no-op, mark the event DISPATCHED and change nothing — the
        // dead letter would have no exit at all.
        //
        // Removing then adding stays safe for the concurrent case this id
        // exists to protect: a job being processed right now is locked, the
        // removal fails, the add deduplicates, and the event is left to the
        // run already under way.
        await queue.remove(job_id).catch(() => undefined);
        await queue.add(INTEGRATION_EVENT_JOB, data, {
          jobId: job_id,
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

/**
 * The dispatcher runs beside the HTTP server but never inside a request: the
 * handler answers 200 from the PostgreSQL commit alone. It connects as the app
 * role because `private.claim_pending_events` is executable by that role only —
 * the worker has no access to the private schema at all (ADR-0019).
 *
 * It schedules itself with `setTimeout` rather than running on a fixed
 * `setInterval`, because the interval between passes is not a constant: after
 * a pass that moved nothing the next one waits longer, up to five minutes, and
 * the first pass that moves anything returns to the configured cadence. A
 * fixed interval has no way to express that, and "skip the tick if the last
 * one is still running" is not backoff — it re-asks the outbox for the same
 * rows at full speed for as long as Redis is down.
 *
 * Recovery after a restart needs nothing extra: the first pass reads pending
 * work from PostgreSQL, which is where it has been the whole time. There is no
 * repeatable job in Redis for the discovery to depend on (ADR-0007).
 */
export function startIngestionDispatcher(): void {
  const interval_ms = dispatchIntervalMs(process.env.INGESTION_DISPATCH_INTERVAL_MS);
  const { publisher } = createIngestionQueue();
  const state = { consecutive_failed_passes: 0 };

  const schedule = (delay_ms: number): void => {
    // Unreferenced so a pending pass never keeps the process alive on its own.
    setTimeout(runPass, delay_ms).unref();
  };

  function runPass(): void {
    void dispatchPendingIntegrationEvents(publisher)
      .then((outcome) => {
        state.consecutive_failed_passes = dispatchPassFailed(outcome)
          ? state.consecutive_failed_passes + 1
          : 0;
      })
      .catch((error: unknown) => {
        // A failed pass changes nothing about the leads: they are still
        // pending and still durable. It only changes the pace.
        state.consecutive_failed_passes += 1;
        logger.error({ event: "integration_event_dispatch", result: "pass_failed", error });
      })
      .finally(() => {
        const delay_ms = nextDispatchDelayMs(state.consecutive_failed_passes, interval_ms);
        if (state.consecutive_failed_passes > 0) {
          logger.warn({
            event: "integration_event_dispatch",
            result: "backing_off",
            consecutive_failed_passes: state.consecutive_failed_passes,
            next_pass_in_ms: delay_ms
          });
        }
        schedule(delay_ms);
      });
  }

  schedule(interval_ms);
  logger.info({ event: "integration_event_dispatch", result: "started" });
}
