const errorKeys = new Set(["error", "err"]);
const allowedKeys = new Set([
  "error_message",
  "error_stack",
  "workspace_id",
  "integration_event_id",
  "source",
  "external_lead_id",
  "event",
  "message",
  "request_id",
  "result",
  "stack",
  "user_id_hash",
  "workspace_slug_hash"
]);

export type SafeTelemetry = Record<string, string | number | boolean | null>;

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value instanceof Error) {
    return { message: value.message, stack: value.stack };
  }

  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }

  return undefined;
}

function asSafePrimitive(value: unknown): string | number | boolean | null | undefined {
  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean" ||
    value === null
  ) {
    return value;
  }

  return undefined;
}

export function sanitizeTelemetry(value: unknown): SafeTelemetry {
  const source = asRecord(value);
  if (!source) {
    return {};
  }

  const safe: SafeTelemetry = {};
  for (const [key, candidate] of Object.entries(source)) {
    // A thrown error is the one nested value worth keeping: without it, every
    // "publish failed" line says only that something failed. Only the two
    // fields an Error is allowed to contribute survive, and a message that is
    // not a string does not become one.
    if (errorKeys.has(key)) {
      const failure = asRecord(candidate);
      const message = asSafePrimitive(failure?.message);
      const stack = asSafePrimitive(failure?.stack);
      if (typeof message === "string") {
        safe.error_message = message;
      }
      if (typeof stack === "string") {
        safe.error_stack = stack;
      }
      continue;
    }
    if (!allowedKeys.has(key)) {
      continue;
    }

    const primitive = asSafePrimitive(candidate);
    if (primitive !== undefined) {
      safe[key] = primitive;
    }
  }

  return safe;
}

