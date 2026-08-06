import { INTEGRATION_EVENT_JOB, INTEGRATION_EVENT_QUEUE } from "@marctco/domain";
import { Queue } from "bullmq";
import IORedis from "ioredis";
import {
  dispatchPendingIntegrationEvents,
  type JobPublisher
} from "./ingestion-dispatcher";
import { logger } from "./logger";

const DEFAULT_INTERVAL_MS = 2_000;
const MINIMUM_INTERVAL_MS = 250;
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

  // `maxRetriesPerRequest: null` is BullMQ's requirement: a command waits for
  // the connection to come back instead of throwing, so a Redis blip shows up
  // as a slow publish rather than a lost pass.
  const connection = new IORedis(redis_url, { maxRetriesPerRequest: null });
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
  const interval_ms = Number.parseInt(
    process.env.INGESTION_DISPATCH_INTERVAL_MS ?? String(DEFAULT_INTERVAL_MS),
    10
  );
  if (!Number.isInteger(interval_ms) || interval_ms < MINIMUM_INTERVAL_MS) {
    throw new Error(
      `INGESTION_DISPATCH_INTERVAL_MS must be an integer of at least ${MINIMUM_INTERVAL_MS}`
    );
  }

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
