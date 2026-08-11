import {
  claimWorkspacesWithExpiringPayloads,
  createJobContext,
  expireIntegrationEventPayloads
} from "@marctco/db";
import { logger } from "./logger";

export const EXPIRY_BATCH_SIZE = 200;
/**
 * A ceiling on how much one tenant clears per pass, so the first sweep after a
 * long backlog cannot spend an hour inside a single workspace while every
 * other one waits. What it does not finish, the next pass finishes.
 */
export const MAX_EXPIRY_BATCHES_PER_WORKSPACE = 25;
export const DEFAULT_EXPIRY_INTERVAL_MS = 3_600_000;
const MINIMUM_EXPIRY_INTERVAL_MS = 60_000;

/**
 * How often the payload expiry runs. Hourly by default: the deadline is 90
 * days, so the difference between clearing a payload at 10:00 and at 10:59 is
 * not worth a sweep every minute.
 */
export function payloadExpiryIntervalMs(configured: string | undefined): number {
  if (configured === undefined) {
    return DEFAULT_EXPIRY_INTERVAL_MS;
  }
  const interval_ms = Number.parseInt(configured, 10);
  if (!Number.isInteger(interval_ms) || interval_ms < MINIMUM_EXPIRY_INTERVAL_MS) {
    throw new Error(
      `PAYLOAD_EXPIRY_INTERVAL_MS must be an integer of at least ${MINIMUM_EXPIRY_INTERVAL_MS}`
    );
  }
  return interval_ms;
}

export interface PayloadExpiryOutcome {
  readonly swept_workspaces: number;
  readonly expired_payloads: number;
}

/**
 * One pass of ADR-0014's retention: for every tenant that has an event old
 * enough, clear the content of expired payloads in batches, each batch in its
 * own tenant-scoped transaction.
 *
 * Discovery is the only step without a tenant, and it is a private function
 * that answers with ids (ADR-0006 regra 9). Everything that touches a payload
 * runs under RLS, with `SET LOCAL app.workspace_id` taken from what that
 * function returned — never with a bypass.
 *
 * One tenant's failure does not end the pass. The sweep is maintenance: the
 * right response to a workspace that errored is to clear the others and try
 * this one again next hour, not to leave every tenant's payload alive because
 * one of them has a problem.
 */
export async function sweepExpiredPayloads(now: Date = new Date()): Promise<PayloadExpiryOutcome> {
  const workspaces = await claimWorkspacesWithExpiringPayloads(now);
  const outcome = { swept_workspaces: 0, expired_payloads: 0 };

  for (const workspace of workspaces) {
    const context = createJobContext({
      workspace_id: workspace.workspace_id,
      integration_event_id: workspace.anchor_integration_event_id
    });
    try {
      for (let batch = 0; batch < MAX_EXPIRY_BATCHES_PER_WORKSPACE; batch += 1) {
        const expired = await expireIntegrationEventPayloads(context, {
          now,
          batch_size: EXPIRY_BATCH_SIZE
        });
        outcome.expired_payloads += expired;
        if (expired < EXPIRY_BATCH_SIZE) {
          break;
        }
      }
      outcome.swept_workspaces += 1;
    } catch (error: unknown) {
      logger.error({
        event: "integration_payload_expiry",
        result: "workspace_failed",
        workspace_id: workspace.workspace_id,
        error
      });
    }
  }

  if (outcome.expired_payloads > 0) {
    logger.info({
      event: "integration_payload_expiry",
      result: "pass_complete",
      swept_workspaces: outcome.swept_workspaces,
      expired_payloads: outcome.expired_payloads
    });
  }
  return outcome;
}

/**
 * The scheduled half. It lives in the application, not in the database:
 * `pg_cron` does not exist on this Supabase plan, and scheduled work was
 * always going to be the application's (ADR-0014).
 *
 * It runs in the web process rather than the worker for the same reason the
 * dispatcher does: discovery without a tenant goes through the `private`
 * schema, and `marctco_worker` has no `USAGE` on it at all (ADR-0019). Moving
 * the sweep to the worker would mean either granting that role the private
 * access the Seam 3 proof denies it, or routing maintenance through Redis and
 * making retention depend on a queue being up.
 *
 * It does not depend on Redis and starts even when the queue is absent.
 */
export function startPayloadExpirySweep(): void {
  const interval_ms = payloadExpiryIntervalMs(process.env.PAYLOAD_EXPIRY_INTERVAL_MS);
  const state = { running: false };

  const timer = setInterval(() => {
    if (state.running) {
      return;
    }
    state.running = true;
    void sweepExpiredPayloads()
      .catch((error: unknown) => {
        // Nothing was lost: the payloads that should have expired are still
        // there, and the next pass expires them.
        logger.error({ event: "integration_payload_expiry", result: "pass_failed", error });
      })
      .finally(() => {
        state.running = false;
      });
  }, interval_ms);
  timer.unref();

  logger.info({ event: "integration_payload_expiry", result: "started" });
}
