const errorKeys = new Set(["error", "err"]);
const MAX_ERROR_MESSAGE = 300;
// PostgreSQL echoes the offending row in DETAIL/Key(...), and for an ingestion
// event that row is the payload. Everything from the first of those markers on
// is dropped: the sentence that names the failure is kept, the values are not.
const ECHOED_VALUE_MARKERS = /\b(DETAIL|Key \(|HINT|WHERE)\b/;
const allowedKeys = new Set([
  "error_message",
  "error_stack",
  "claimed",
  "dispatched",
  // Ticket 15: the pace of the outbox sweep and the shape of a recovery pass.
  // Counts and durations, never a lead.
  "consecutive_failed_passes",
  "next_pass_in_ms",
  "expired_payloads",
  "swept_workspaces",
  "attempts_made",
  "job_id",
  "workspace_id",
  "integration_event_id",
  "attempt_id",
  "integration_connection_id",
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

function withoutEchoedValues(text: string): string {
  const marker = ECHOED_VALUE_MARKERS.exec(text);
  const kept = marker?.index === undefined ? text : text.slice(0, marker.index);
  return kept.trim().slice(0, MAX_ERROR_MESSAGE);
}

/**
 * The one line a human reads when a lead lands in the dead letter. It is
 * written to `IntegrationEvent.failure_reason`, a column the 90-day payload
 * expiry does not reach (ADR-0014) — so it goes through exactly the same
 * scrubbing a log line does: the sentence that names the failure survives, and
 * everything from PostgreSQL's `DETAIL`/`Key (...)` on, which is where the
 * offending row (the payload, with CPF and phone) gets echoed, does not
 * (ADR-0006 regra 12).
 *
 * Kept here rather than in `packages/db` because it is the same rule as
 * `sanitizeTelemetry`, and two copies of "what may leave the tenant" is how
 * one of them silently stops being true.
 */
export function describeFailureReason(value: unknown): string {
  if (value instanceof Error) {
    const described = withoutEchoedValues(`${value.name}: ${value.message}`);
    return described === "" || described === `${value.name}:` ? value.name : described;
  }
  if (typeof value === "string" && value.trim() !== "") {
    return withoutEchoedValues(value);
  }
  return "Unknown failure";
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
        safe.error_message = withoutEchoedValues(message);
      }
      if (typeof stack === "string") {
        safe.error_stack = withoutEchoedValues(stack);
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

