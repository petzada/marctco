import { sanitizeTelemetry } from "@marctco/domain";
import pino, { type Logger } from "pino";

function sanitizeLogArguments(arguments_: unknown[]): unknown[] {
  return arguments_.map((argument) => {
    if (argument instanceof Error || (typeof argument === "object" && argument !== null)) {
      return sanitizeTelemetry(argument);
    }
    return argument;
  });
}

export function createSafeLogger(): Logger {
  return pino({
    base: null,
    serializers: {
      err: sanitizeTelemetry,
      error: sanitizeTelemetry,
      context: sanitizeTelemetry
    },
    hooks: {
      logMethod(arguments_, method) {
        const safe_arguments = sanitizeLogArguments(arguments_) as [
          object,
          string?,
          ...unknown[]
        ];
        return method.apply(this, safe_arguments);
      }
    }
  });
}
