import { sanitizeTelemetry } from "@marctco/domain";
import pino, { type Logger } from "pino";

export const logger: Logger = pino({
  base: null,
  formatters: {
    bindings: sanitizeTelemetry
  },
  serializers: {
    err: sanitizeTelemetry,
    error: sanitizeTelemetry,
    context: sanitizeTelemetry
  },
  hooks: {
    logMethod(arguments_, method) {
      const safe = arguments_.map((argument) =>
        argument instanceof Error || (typeof argument === "object" && argument !== null)
          ? sanitizeTelemetry(argument)
          : argument
      ) as [object, string?];
      return method.apply(this, safe);
    }
  }
});
