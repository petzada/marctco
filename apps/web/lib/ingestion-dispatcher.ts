import {
  claimPendingIntegrationEvents,
  createJobContext,
  markIntegrationEventDispatched,
  type PendingIntegrationEvent
} from "@marctco/db";
import { integrationEventJobId, type IntegrationEventJobData } from "@marctco/domain";
import { logger } from "./logger";

export const DISPATCH_BATCH_SIZE = 50;

export interface JobPublisher {
  publish(job_id: string, data: IntegrationEventJobData): Promise<void>;
}

export interface DispatchOutcome {
  readonly claimed: number;
  readonly dispatched: number;
}

/**
 * One pass of the outbox: read pending events, publish, and only then record
 * the dispatch. The order is the whole point — marking first would let a
 * failed publish look like delivered work, and an unavailable Redis must leave
 * the event exactly as it was, pending and durable (ADR-0007).
 *
 * The publish happens outside any transaction: a transaction never contains an
 * external network call. Publishing twice is safe, because the job id derives
 * from the event id.
 */
export async function dispatchPendingIntegrationEvents(
  publisher: JobPublisher,
  batch_size: number = DISPATCH_BATCH_SIZE
): Promise<DispatchOutcome> {
  const pending: PendingIntegrationEvent[] = await claimPendingIntegrationEvents(batch_size);
  let dispatched = 0;

  for (const event of pending) {
    const data: IntegrationEventJobData = {
      integration_event_id: event.id,
      workspace_id: event.workspace_id
    };
    try {
      await publisher.publish(integrationEventJobId(event.id), data);
    } catch (error: unknown) {
      // The event stays pending and the next pass tries again. Nothing about
      // the lead is lost by the queue being unreachable.
      logger.warn({
        event: "integration_event_dispatch",
        result: "publish_failed",
        workspace_id: event.workspace_id,
        integration_event_id: event.id,
        error
      });
      continue;
    }

    await markIntegrationEventDispatched(
      createJobContext({
        workspace_id: event.workspace_id,
        integration_event_id: event.id
      })
    );
    dispatched += 1;
  }

  if (pending.length > 0) {
    logger.info({
      event: "integration_event_dispatch",
      result: "pass_complete",
      claimed: pending.length,
      dispatched
    });
  }
  return { claimed: pending.length, dispatched };
}
