import { createServer } from "node:http";
import { assertSafeDatabaseRole } from "@marctco/db";
import { createSafeLogger } from "./logger.js";

const logger = createSafeLogger();

async function main(): Promise<void> {
  await assertSafeDatabaseRole({ process_name: "worker" });

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
}

main().catch((error: unknown) => {
  logger.fatal(error);
  process.exitCode = 1;
});

