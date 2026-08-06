import { createServer } from "node:http";
import { assertSafeDatabaseRole } from "@marctco/db";
import { INTEGRATION_EVENT_QUEUE } from "@marctco/domain";
import { Worker } from "bullmq";
import IORedis from "ioredis";
import { processIntegrationEventJob } from "./integration-event-job.js";
import { createSafeLogger } from "./logger.js";

const logger = createSafeLogger();

function startIntegrationEventWorker(): Worker | undefined {
  const url = process.env.REDIS_URL;
  if (!url) {
    logger.warn({ message: "REDIS_URL is absent; integration events will not be consumed" });
    return undefined;
  }

  const worker = new Worker(
    INTEGRATION_EVENT_QUEUE,
    async (job) => processIntegrationEventJob(job.data),
    { connection: new IORedis(url, { maxRetriesPerRequest: null }) }
  );
  worker.on("failed", (job, error) => {
    // A job that claims the wrong tenant reads zero rows and lands here. It is
    // meant to be loud: BullMQ retries it and, once exhausted, it stays visible
    // for reprocessing rather than disappearing.
    logger.error({ event: "integration_event_job", result: "failed", job_id: job?.id, error });
  });
  return worker;
}

async function main(): Promise<void> {
  await assertSafeDatabaseRole({ process_name: "worker" });
  const integrationEventWorker = startIntegrationEventWorker();

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
      void integrationEventWorker?.close().finally(() => {
        server.close();
      });
    });
  }
}

main().catch((error: unknown) => {
  logger.fatal(error);
  process.exitCode = 1;
});

