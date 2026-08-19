import {
  acceptChannelOutboundAttempt,
  beginChannelOutboundAttempt,
  createJobContext,
  failChannelOutboundAttempt,
  getChannelOutboundAttempt,
  loadChannelOutboundSend,
  readWorkspaceFeatureFlags,
  withResolvedFeatureFlags
} from "@marctco/db";
import {
  classifySendTextFailure,
  prepareChannelOutboundSend,
  type ChannelOutboundJobData,
  type MessagingProvider,
  type RateLimiter
} from "@marctco/domain";
import { DelayedError } from "bullmq";

export interface ChannelOutboundJobDependencies {
  readonly provider: MessagingProvider;
  readonly rateLimiter?: RateLimiter;
  readonly now?: () => Date;
}

export interface ProcessedChannelOutboundJob {
  readonly attempt_id: string;
  readonly workspace_id: string;
  readonly outcome: "sent" | "failed" | "skipped" | "deferred";
  readonly retry_after_ms?: number;
}

function assertJobData(data: unknown): asserts data is ChannelOutboundJobData {
  if (typeof data !== "object" || data === null) {
    throw new Error("A channel outbound job must carry its identifiers");
  }
  const candidate = data as Record<string, unknown>;
  if (typeof candidate.attempt_id !== "string" || typeof candidate.workspace_id !== "string") {
    throw new Error("A channel outbound job must carry its identifiers");
  }
}

/**
 * Marks PROCESSING in a short transaction, performs at most one sendText
 * outside any transaction, then persists SENT or FAILED. After HTTP starts,
 * the job never returns the attempt to PENDING.
 */
export async function processChannelOutboundJob(
  data: unknown,
  dependencies: ChannelOutboundJobDependencies
): Promise<ProcessedChannelOutboundJob> {
  assertJobData(data);
  const now = dependencies.now ?? (() => new Date());
  let context = createJobContext({
    workspace_id: data.workspace_id,
    origin: { type: "channel_outbound", attempt_id: data.attempt_id }
  });
  const feature_flags = await readWorkspaceFeatureFlags(context);
  context = withResolvedFeatureFlags(context, feature_flags);

  const attempt = await getChannelOutboundAttempt(context);
  if (!attempt) {
    throw new Error("The channel outbound attempt is not visible in the workspace its job claims");
  }
  if (attempt.delivery_status === "SENT" || attempt.delivery_status === "FAILED") {
    return outcome(data, "skipped");
  }
  if (attempt.delivery_status === "PROCESSING") {
    await failChannelOutboundAttempt(context, { reason: "UNCERTAIN_EXTERNAL", now: now() });
    return outcome(data, "failed");
  }

  const payload = await loadChannelOutboundSend(context);
  if (!payload) {
    throw new Error("The channel outbound attempt is not visible in the workspace its job claims");
  }
  const prepared = prepareChannelOutboundSend(payload);
  if (prepared.kind === "FAIL") {
    await beginChannelOutboundAttempt(context, now());
    await failChannelOutboundAttempt(context, { reason: prepared.reason, now: now() });
    return outcome(data, "failed");
  }

  if (dependencies.rateLimiter) {
    const decision = dependencies.rateLimiter.consume(data.workspace_id);
    if (!decision.allowed) {
      return {
        ...outcome(data, "deferred"),
        retry_after_ms: decision.retry_after_ms ?? 10_000
      };
    }
  }

  await beginChannelOutboundAttempt(context, now());
  try {
    const result = await dependencies.provider.sendText({
      instance_name: prepared.instance_name,
      number: prepared.number,
      text: prepared.text
    });
    if (result.kind === "accepted") {
      await acceptChannelOutboundAttempt(context, { accepted_at: now() });
      return outcome(data, "sent");
    }
    await failChannelOutboundAttempt(context, {
      reason: classifySendTextFailure(result),
      now: now()
    });
    return outcome(data, "failed");
  } catch {
    await failChannelOutboundAttempt(context, {
      reason: "UNCERTAIN_EXTERNAL",
      now: now()
    });
    return outcome(data, "failed");
  }
}

function outcome(
  data: ChannelOutboundJobData,
  value: ProcessedChannelOutboundJob["outcome"]
): ProcessedChannelOutboundJob {
  return {
    attempt_id: data.attempt_id,
    workspace_id: data.workspace_id,
    outcome: value
  };
}

interface ChannelOutboundWorkerJob {
  moveToDelayed(timestamp: number, token: string): Promise<unknown>;
}

/**
 * Rate limiting happens before PROCESSING. BullMQ must delay the job without
 * consuming attempts or marking it failed — a generic throw would exhaust
 * retries and leave DISPATCHED+QUEUED stuck with no sendText.
 */
export async function finishChannelOutboundWorkerJob(
  job: ChannelOutboundWorkerJob,
  token: string | undefined,
  processed: ProcessedChannelOutboundJob
): Promise<ProcessedChannelOutboundJob> {
  if (processed.outcome !== "deferred") {
    return processed;
  }
  if (token === undefined) {
    throw new Error("A deferred channel outbound job requires a worker lock token");
  }
  const delay_ms = processed.retry_after_ms ?? 10_000;
  await job.moveToDelayed(Date.now() + delay_ms, token);
  throw new DelayedError();
}
