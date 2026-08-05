const allowedKeys = new Set([
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

