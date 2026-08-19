import { createServer } from "node:http";
import { assertSafeDatabaseRole } from "@marctco/db";
import {
  CHANNEL_OUTBOUND_QUEUE,
  CHANNEL_OUTBOUND_RATE_LIMIT_MAX,
  CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS,
  INTEGRATION_EVENT_QUEUE,
  createMemoryRateLimiter
} from "@marctco/domain";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { finishChannelOutboundWorkerJob, processChannelOutboundJob } from "./channel-outbound-job.js";
import { recordDeadLetter } from "./dead-letter.js";
import { processIntegrationEventJob } from "./integration-event-job.js";
import { createSafeLogger } from "./logger.js";
import { createWhatsMiauMessagingProvider, readWhatsMiauApiKey } from "./whatsmiau-send-text.js";

const logger = createSafeLogger();

function startIntegrationEventWorker(): Worker | undefined {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn({ message: "REDIS_URL is absent; integration events will not be consumed" });
    return undefined;
  }

  // `maxRetriesPerRequest: null` is BullMQ's requirement for a Worker: a
  // command waits for the connection to come back rather than throwing, so a
  // Redis blip pauses consumption instead of killing the process.
  const worker = new Worker(
    INTEGRATION_EVENT_QUEUE,
    async (job) => processIntegrationEventJob(job.data),
    { connection: new IORedis(url, { maxRetriesPerRequest: null }) }
  );
  worker.on("completed", (job, result: { integration_event_id: string }) => {
    logger.info({
      event: "integration_event_job",
      result: "processed",
      job_id: job.id,
      integration_event_id: result.integration_event_id
    });
  });
  worker.on("failed", (job, error) => {
    // A job that claims the wrong tenant reads zero rows and lands here. It is
    // meant to be loud: BullMQ retries it and, once exhausted, it stays visible
    // for reprocessing rather than disappearing.
    logger.error({
      event: "integration_event_job",
      result: "failed",
      job_id: job?.id,
      attempts_made: job?.attemptsMade,
      error
    });
    void recordDeadLetter(job, error)
      .then((result) => {
        if (result === "dead_lettered" || result === "already_settled") {
          logger.warn({ event: "integration_event_job", result, job_id: job?.id });
        }
      })
      .catch((failure: unknown) => {
        // The event stays as it was and the operator still has the log. A dead
        // letter that cannot be written must not take the worker down with it.
        logger.error({
          event: "integration_event_job",
          result: "dead_letter_failed",
          job_id: job?.id,
          error: failure
        });
      });
  });
  return worker;
}

function startChannelOutboundWorker(): Worker | undefined {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn({ message: "REDIS_URL is absent; channel outbound will not be consumed" });
    return undefined;
  }
  const api_key = readWhatsMiauApiKey();
  if (!api_key) {
    logger.warn({ message: "WHATSMIAU_APIKEY is absent; channel outbound will not be consumed" });
    return undefined;
  }

  const provider = createWhatsMiauMessagingProvider({ api_key });
  const rateLimiter = createMemoryRateLimiter({
    limit: CHANNEL_OUTBOUND_RATE_LIMIT_MAX,
    window_ms: CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS
  });
  const worker = new Worker(
    CHANNEL_OUTBOUND_QUEUE,
    async (job, token) => {
      const processed = await processChannelOutboundJob(job.data, { provider, rateLimiter });
      return finishChannelOutboundWorkerJob(job, token, processed);
    },
    {
      connection: new IORedis(url, { maxRetriesPerRequest: null }),
      concurrency: 8
    }
  );
  worker.on("completed", (job, result: { attempt_id: string; workspace_id: string; outcome: string }) => {
    logger.info({
      event: "channel_outbound_job",
      result: result.outcome,
      job_id: job.id,
      attempt_id: result.attempt_id,
      workspace_id: result.workspace_id
    });
  });
  worker.on("failed", (job, error) => {
    logger.error({
      event: "channel_outbound_job",
      result: "failed",
      job_id: job?.id,
      attempts_made: job?.attemptsMade,
      error
    });
  });
  return worker;
}

async function main(): Promise<void> {
  await assertSafeDatabaseRole({ process_name: "worker" });
  const integrationEventWorker = startIntegrationEventWorker();
  const channelOutboundWorker = startChannelOutboundWorker();

  const port = Number.parseInt(process.env.PORT ?? "3001", 10);
  const server = createServer((request, response) => {
    if (request.url === "/health") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ status: "ok" }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ status: "not_found" }));
  });

  server.listen(port, () => {
    logger.info({ message: "worker ready" });
  });

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void Promise.all([
        integrationEventWorker?.close(),
        channelOutboundWorker?.close()
      ]).finally(() => {
        server.close();
      });
    });
  }
}

main().catch((error: unknown) => {
  logger.fatal(error);
  process.exitCode = 1;
});

