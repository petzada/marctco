import {
  claimWorkspacesWithOverdueOpportunities,
  createJobContext,
  sweepWorkspaceOpportunityClock
} from "@marctco/db";
import { logger } from "./logger";

export const DEFAULT_OPPORTUNITY_CLOCK_INTERVAL_MS = 300_000;
const MINIMUM_OPPORTUNITY_CLOCK_INTERVAL_MS = 60_000;

/**
 * How often the SLA / stagnation sweep runs. Five minutes by default: the
 * first-contact clock is measured in minutes, not days.
 */
export function opportunityClockIntervalMs(configured: string | undefined): number {
  if (configured === undefined) {
    return DEFAULT_OPPORTUNITY_CLOCK_INTERVAL_MS;
  }
  const interval_ms = Number.parseInt(configured, 10);
  if (!Number.isInteger(interval_ms) || interval_ms < MINIMUM_OPPORTUNITY_CLOCK_INTERVAL_MS) {
    throw new Error(
      `OPPORTUNITY_CLOCK_INTERVAL_MS must be an integer of at least ${MINIMUM_OPPORTUNITY_CLOCK_INTERVAL_MS}`
    );
  }
  return interval_ms;
}

export interface OpportunityClockPassOutcome {
  readonly swept_workspaces: number;
  readonly upserted: number;
  readonly resolved: number;
}

/**
 * One pass of the opportunity clocks: discover tenants with a private
 * function, then write each one under its own JobContext. Redis is not
 * involved. One tenant's failure logs and leaves the rest of the pass
 * running.
 */
export async function sweepOpportunityClocks(
  now: Date = new Date()
): Promise<OpportunityClockPassOutcome> {
  const workspaces = await claimWorkspacesWithOverdueOpportunities(now);
  const outcome = { swept_workspaces: 0, upserted: 0, resolved: 0 };

  for (const workspace of workspaces) {
    const context = createJobContext({
      workspace_id: workspace.workspace_id,
      origin: { type: "scheduled_sweep", sweep: "OPPORTUNITY_CLOCK" }
    });
    try {
      const result = await sweepWorkspaceOpportunityClock(context, now);
      outcome.upserted += result.upserted;
      outcome.resolved += result.resolved;
      outcome.swept_workspaces += 1;
    } catch (error: unknown) {
      logger.error({
        event: "opportunity_clock_sweep",
        result: "workspace_failed",
        workspace_id: workspace.workspace_id,
        error
      });
    }
  }

  if (outcome.upserted > 0 || outcome.resolved > 0) {
    logger.info({
      event: "opportunity_clock_sweep",
      result: "pass_complete",
      swept_workspaces: outcome.swept_workspaces,
      upserted: outcome.upserted,
      resolved: outcome.resolved
    });
  }
  return outcome;
}

/**
 * Scheduled half, in the web process, independent of Redis: the worker has
 * no USAGE on `private`, and the clock cannot wait on the ingestion queue
 * (ADR-0014, ADR-0019).
 */
export function startOpportunityClockSweep(): void {
  const interval_ms = opportunityClockIntervalMs(process.env.OPPORTUNITY_CLOCK_INTERVAL_MS);
  const state = { running: false };

  const timer = setInterval(() => {
    if (state.running) {
      return;
    }
    state.running = true;
    void sweepOpportunityClocks()
      .catch((error: unknown) => {
        logger.error({ event: "opportunity_clock_sweep", result: "pass_failed", error });
      })
      .finally(() => {
        state.running = false;
      });
  }, interval_ms);
  timer.unref();

  logger.info({ event: "opportunity_clock_sweep", result: "started" });
}
