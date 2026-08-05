import { sanitizeTelemetry } from "@marctco/domain";
import pino, {
  type Bindings,
  type ChildLoggerOptions,
  type DestinationStream,
  type Logger
} from "pino";

function sanitizeLogArguments(arguments_: unknown[]): unknown[] {
  return arguments_.map((argument) => {
    if (argument instanceof Error || (typeof argument === "object" && argument !== null)) {
      return sanitizeTelemetry(argument);
    }
    return argument;
  });
}

function protectChildBindings(logger: Logger): Logger {
  const child = logger.child.bind(logger);
  logger.child = ((bindings: Bindings, options?: ChildLoggerOptions) =>
    protectChildBindings(child(sanitizeTelemetry(bindings), options))) as unknown as Logger["child"];
  return logger;
}

export function createSafeLogger(destination?: DestinationStream): Logger {
  return protectChildBindings(
    pino(
      {
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
            const safe_arguments = sanitizeLogArguments(arguments_) as [
              object,
              string?,
              ...unknown[]
            ];
            return method.apply(this, safe_arguments);
          }
        }
      },
      destination
    )
  );
}
