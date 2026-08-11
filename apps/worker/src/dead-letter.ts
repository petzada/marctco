import { createJobContext, markIntegrationEventFailed } from "@marctco/db";
import { describeFailureReason } from "@marctco/domain";

/**
 * The part of a failed BullMQ job this module needs, spelled structurally so a
 * test can drive it without constructing a real `Job` — and so the rule about
 * *when* a failure becomes a dead letter is exercisable without a Redis.
 */
export interface FailedJobFacts {
  readonly data: unknown;
  readonly attemptsMade: number;
  readonly opts: { readonly attempts?: number };
}

export type DeadLetterOutcome = "dead_lettered" | "already_settled" | "retry_pending" | "unusable";

/**
 * True once BullMQ has spent the last attempt it was going to spend. Only then
 * is a failure a dead letter: while retries remain the lead is still on its way
 * in, and telling the Integrações screen otherwise asks an operator to act on
 * something the queue is about to fix by itself.
 */
export function jobAttemptsExhausted(
  attempts_made: number,
  configured_attempts: number | undefined
): boolean {
  return attempts_made >= (configured_attempts ?? 1);
}

/**
 * Writes the dead letter for a job that has run out of attempts.
 *
 * It lives here rather than inside the processor because the processor cannot
 * know it was the last try — the job carries that, and BullMQ only knows it
 * after the throw.
 *
 * The reason is scrubbed before it lands in a column the 90-day payload expiry
 * never reaches: the worker fails with the raw lead in scope, and PostgreSQL
 * echoes the offending row in `DETAIL` (ADR-0006 regra 12, ADR-0014).
 */
export async function recordDeadLetter(
  job: FailedJobFacts | undefined,
  error: unknown
): Promise<DeadLetterOutcome> {
  const data: unknown = job?.data;
  if (typeof data !== "object" || data === null) {
    return "unusable";
  }
  const { integration_event_id, workspace_id } = data as Record<string, unknown>;
  if (typeof integration_event_id !== "string" || typeof workspace_id !== "string") {
    return "unusable";
  }
  if (!jobAttemptsExhausted(job?.attemptsMade ?? 0, job?.opts.attempts)) {
    return "retry_pending";
  }

  const context = createJobContext({ workspace_id, integration_event_id });
  const marked = await markIntegrationEventFailed(context, describeFailureReason(error));
  return marked ? "dead_lettered" : "already_settled";
}
