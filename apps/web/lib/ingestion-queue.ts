import { INTEGRATION_EVENT_JOB, INTEGRATION_EVENT_QUEUE } from "@marctco/domain";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  dispatchIntervalMs,
  dispatchPendingIntegrationEvents,
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
 */
export function startIngestionDispatcher(): void {
  const interval_ms = dispatchIntervalMs(process.env.INGESTION_DISPATCH_INTERVAL_MS);
  const { publisher } = createIngestionQueue();
  const state = { running: false };
  const timer = setInterval(() => {
    if (state.running) {
      return;
    }
    state.running = true;
    void dispatchPendingIntegrationEvents(publisher)
      .catch((error: unknown) => {
        // A failed pass changes nothing: the events are still pending, and the
        // next tick picks them up.
        logger.error({ event: "integration_event_dispatch", result: "pass_failed", error });
      })
      .finally(() => {
        state.running = false;
      });
  }, interval_ms);
  timer.unref();

  logger.info({ event: "integration_event_dispatch", result: "started" });
}
