import { Prisma, type PrismaClient } from "@prisma/client";
import {
  CHANNEL_OUTBOUND_KIND,
  CHANNEL_OUTBOUND_PROCESSING_LEASE_MS,
  decideChannelOutboundTransition,
  planFirstContactAttempt,
  type ChannelOutboundDeliveryStatus,
  type ChannelOutboundDispatchStatus,
  type ChannelOutboundFailureReason,
  type FirstContactAttemptRefusal,
  type FirstContactTrigger,
  type WhatsAppPairingState
} from "@marctco/domain";
import {
  isJobContext,
  isUserContext,
  jobChannelAttemptId,
  type AccessContext,
  type JobContext
} from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext, type ScopedTransactionClient } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();
const MAX_CLAIM_BATCH = 500;

export type ChannelOutboundRefusal =
  | FirstContactAttemptRefusal
  | "OPPORTUNITY_NOT_VISIBLE"
  | "ATTEMPT_NOT_VISIBLE"
  | "INVALID_TRANSITION"
  | "ALREADY_TERMINAL"
  | "ORIGIN_REQUIRED";

export class ChannelOutboundError extends Error {
  constructor(readonly reason: ChannelOutboundRefusal) {
    super(reason);
    this.name = "ChannelOutboundError";
  }
}

export interface PlanChannelOutboundAttemptInput {
  readonly opportunity_id: string;
  readonly occurred_trigger: Exclude<FirstContactTrigger, "DISABLED">;
  readonly feature_flag_enabled: boolean;
  readonly trigger: FirstContactTrigger;
  readonly whatsapp_opt_in: boolean | null;
  readonly missing_phone: boolean;
  readonly status: "OPEN" | "WON" | "LOST";
  readonly merged: boolean;
  readonly pairing_state: WhatsAppPairingState | null;
  readonly attendant_phone_present: boolean;
}

export type PlannedChannelOutboundAttempt =
  | { readonly kind: "NONE"; readonly reason: FirstContactAttemptRefusal }
  | { readonly kind: "QUEUED"; readonly attempt_id: string }
  | {
      readonly kind: "FAILED";
      readonly attempt_id: string;
      readonly reason: Extract<
        ChannelOutboundFailureReason,
        "INSTANCE_NOT_CONNECTED" | "ATTENDANT_PHONE_MISSING"
      >;
    };

export interface PendingChannelAttempt {
  readonly attempt_id: string;
  readonly workspace_id: string;
}

export interface ChannelOutboundAttemptView {
  readonly id: string;
  readonly opportunity_id: string;
  readonly kind: typeof CHANNEL_OUTBOUND_KIND;
  readonly dispatch_status: ChannelOutboundDispatchStatus;
  readonly delivery_status: ChannelOutboundDeliveryStatus;
  readonly failure_reason: ChannelOutboundFailureReason | null;
  readonly provider_message_id: string | null;
  readonly dispatched_at: Date | null;
  readonly sent_at: Date | null;
  readonly failed_at: Date | null;
}

interface AttemptRow {
  readonly id: string;
  readonly opportunity_id: string;
  readonly kind: typeof CHANNEL_OUTBOUND_KIND;
  readonly dispatch_status: ChannelOutboundDispatchStatus;
  readonly delivery_status: ChannelOutboundDeliveryStatus;
  readonly failure_reason: ChannelOutboundFailureReason | null;
  readonly provider_message_id: string | null;
  readonly dispatched_at: Date | null;
  readonly sent_at: Date | null;
  readonly failed_at: Date | null;
}

const ATTEMPT_SELECT = Prisma.sql`
  attempt.id,
  attempt.opportunity_id,
  attempt.kind,
  attempt.dispatch_status,
  attempt.delivery_status,
  attempt.failure_reason,
  attempt.provider_message_id,
  attempt.dispatched_at,
  attempt.sent_at,
  attempt.failed_at
`;

function toView(row: AttemptRow): ChannelOutboundAttemptView {
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    kind: CHANNEL_OUTBOUND_KIND,
    dispatch_status: row.dispatch_status,
    delivery_status: row.delivery_status,
    failure_reason: row.failure_reason,
    provider_message_id: row.provider_message_id,
    dispatched_at: row.dispatched_at,
    sent_at: row.sent_at,
    failed_at: row.failed_at
  };
}

function requireChannelOutbound(context: AccessContext): JobContext {
  if (!isJobContext(context) || context.origin.type !== "channel_outbound") {
    throw new ChannelOutboundError("ORIGIN_REQUIRED");
  }
  return context;
}

function opportunityVisibleSql(context: AccessContext): Prisma.Sql {
  if (!isUserContext(context)) {
    return Prisma.sql``;
  }
  return opportunityScopeSql(context, "opportunity");
}

/**
 * Plans and records the automatic first-contact attempt inside the caller's
 * already-open tenant transaction so assignment/arrival can share the commit.
 */
export async function planAndRecordChannelOutboundAttemptInTransaction(
  transaction: ScopedTransactionClient,
  context: AccessContext,
  input: PlanChannelOutboundAttemptInput
): Promise<PlannedChannelOutboundAttempt> {
  assertUuid(input.opportunity_id, "opportunity_id");
  const visible = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT opportunity.id
    FROM opportunities AS opportunity
    WHERE opportunity.workspace_id = ${context.workspace_id}::uuid
      AND opportunity.id = ${input.opportunity_id}::uuid
      ${opportunityVisibleSql(context)}
  `);
  if (!visible[0]) {
    throw new ChannelOutboundError("OPPORTUNITY_NOT_VISIBLE");
  }

  const existing = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT id
    FROM channel_outbound_attempts
    WHERE workspace_id = ${context.workspace_id}::uuid
      AND opportunity_id = ${input.opportunity_id}::uuid
      AND kind = ${CHANNEL_OUTBOUND_KIND}::channel_outbound_attempt_kind
  `);

  const plan = planFirstContactAttempt({
    ...input,
    already_attempted: existing.length > 0
  });
  if (plan.kind === "NONE") {
    return plan;
  }

  if (plan.kind === "QUEUE") {
    const inserted = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      INSERT INTO channel_outbound_attempts (
        workspace_id, opportunity_id, kind, dispatch_status, delivery_status, updated_at
      )
      VALUES (
        ${context.workspace_id}::uuid,
        ${input.opportunity_id}::uuid,
        ${CHANNEL_OUTBOUND_KIND}::channel_outbound_attempt_kind,
        'PENDING'::channel_outbound_dispatch_status,
        'QUEUED'::channel_outbound_delivery_status,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (workspace_id, opportunity_id, kind) DO NOTHING
      RETURNING id
    `);
    const attempt_id = inserted[0]?.id;
    if (!attempt_id) {
      return { kind: "NONE", reason: "ALREADY_ATTEMPTED" };
    }
    return { kind: "QUEUED", attempt_id };
  }

  const failed = await transaction.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    INSERT INTO channel_outbound_attempts (
      workspace_id, opportunity_id, kind, dispatch_status, delivery_status,
      failure_reason, dispatched_at, failed_at, updated_at
    )
    VALUES (
      ${context.workspace_id}::uuid,
      ${input.opportunity_id}::uuid,
      ${CHANNEL_OUTBOUND_KIND}::channel_outbound_attempt_kind,
      'DISPATCHED'::channel_outbound_dispatch_status,
      'FAILED'::channel_outbound_delivery_status,
      ${plan.reason}::channel_outbound_failure_reason,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP,
      CURRENT_TIMESTAMP
    )
    ON CONFLICT (workspace_id, opportunity_id, kind) DO NOTHING
    RETURNING id
  `);
  const attempt_id = failed[0]?.id;
  if (!attempt_id) {
    return { kind: "NONE", reason: "ALREADY_ATTEMPTED" };
  }
  await insertMessageFact(transaction, {
    workspace_id: context.workspace_id,
    opportunity_id: input.opportunity_id,
    type: "WHATSAPP_OUTBOUND_FAILED",
    occurred_at: null
  });
  return { kind: "FAILED", attempt_id, reason: plan.reason };
}

export async function planAndRecordChannelOutboundAttempt(
  context: AccessContext,
  input: PlanChannelOutboundAttemptInput,
  prisma: PrismaClient = sharedPrisma
): Promise<PlannedChannelOutboundAttempt> {
  return withAccessContext(prisma, context, (transaction) =>
    planAndRecordChannelOutboundAttemptInTransaction(transaction, context, input)
  );
}

/**
 * Pre-tenant discovery. Returns only `(attempt_id, workspace_id)` and never
 * a phone, body or opportunity id (ADR-0019).
 */
export async function claimPendingChannelAttempts(
  batch_size: number,
  observed_at: Date = new Date(),
  prisma: PrismaClient = sharedPrisma
): Promise<PendingChannelAttempt[]> {
  if (!Number.isInteger(batch_size) || batch_size < 1) {
    throw new Error("claimPendingChannelAttempts requires a positive batch size");
  }
  if (Number.isNaN(observed_at.getTime())) {
    throw new Error("claimPendingChannelAttempts requires a valid instant");
  }
  const limit = Math.min(batch_size, MAX_CLAIM_BATCH);
  return prisma.$queryRaw<PendingChannelAttempt[]>`
    SELECT attempt_id, workspace_id
    FROM private.claim_pending_channel_attempts(${limit}::integer, ${observed_at}::timestamptz)
  `;
}

export async function getChannelOutboundAttempt(
  context: JobContext,
  prisma: PrismaClient = sharedPrisma
): Promise<ChannelOutboundAttemptView | null> {
  const job = requireChannelOutbound(context);
  const attempt_id = jobChannelAttemptId(job);
  return withAccessContext(prisma, job, async (transaction) => {
    const rows = await loadAttempt(transaction, job.workspace_id, attempt_id);
    return rows[0] ? toView(rows[0]) : null;
  });
}

export async function dispatchChannelOutboundAttempt(
  context: JobContext,
  now: Date = new Date(),
  prisma: PrismaClient = sharedPrisma
): Promise<ChannelOutboundAttemptView> {
  return transitionAttempt(context, "DISPATCH", { now }, prisma);
}

export async function beginChannelOutboundAttempt(
  context: JobContext,
  now: Date = new Date(),
  prisma: PrismaClient = sharedPrisma
): Promise<ChannelOutboundAttemptView> {
  return transitionAttempt(context, "BEGIN_SEND", { now }, prisma);
}

export async function acceptChannelOutboundAttempt(
  context: JobContext,
  input: { readonly accepted_at: Date; readonly provider_message_id?: string | null },
  prisma: PrismaClient = sharedPrisma
): Promise<ChannelOutboundAttemptView> {
  if (Number.isNaN(input.accepted_at.getTime())) {
    throw new Error("acceptChannelOutboundAttempt requires a valid accepted_at");
  }
  return transitionAttempt(
    context,
    "ACCEPT",
    { now: input.accepted_at, provider_message_id: input.provider_message_id ?? null },
    prisma
  );
}

export async function failChannelOutboundAttempt(
  context: JobContext,
  input: { readonly reason: ChannelOutboundFailureReason; readonly now?: Date },
  prisma: PrismaClient = sharedPrisma
): Promise<ChannelOutboundAttemptView> {
  return transitionAttempt(
    context,
    "FAIL",
    { now: input.now ?? new Date(), failure_reason: input.reason },
    prisma
  );
}

async function transitionAttempt(
  context: JobContext,
  action: "DISPATCH" | "BEGIN_SEND" | "ACCEPT" | "FAIL",
  input: {
    readonly now: Date;
    readonly provider_message_id?: string | null;
    readonly failure_reason?: ChannelOutboundFailureReason;
  },
  prisma: PrismaClient
): Promise<ChannelOutboundAttemptView> {
  const job = requireChannelOutbound(context);
  const attempt_id = jobChannelAttemptId(job);
  if (Number.isNaN(input.now.getTime())) {
    throw new Error("channel outbound transition requires a valid instant");
  }

  return withAccessContext(prisma, job, async (transaction) => {
    const current = (await loadAttempt(transaction, job.workspace_id, attempt_id))[0];
    if (!current) {
      throw new ChannelOutboundError("ATTEMPT_NOT_VISIBLE");
    }
    const decision = decideChannelOutboundTransition(
      {
        dispatch_status: current.dispatch_status,
        delivery_status: current.delivery_status
      },
      action
    );
    if (!decision.allowed) {
      throw new ChannelOutboundError(decision.reason);
    }

    const processing_lease_until =
      action === "BEGIN_SEND"
        ? new Date(input.now.getTime() + CHANNEL_OUTBOUND_PROCESSING_LEASE_MS)
        : null;
    const failure_reason = action === "FAIL" ? (input.failure_reason ?? "UNCERTAIN_EXTERNAL") : null;
    const provider_message_id = action === "ACCEPT" ? (input.provider_message_id ?? null) : null;

    const updated = await transaction.$queryRaw<AttemptRow[]>(Prisma.sql`
      UPDATE channel_outbound_attempts AS attempt
      SET
        dispatch_status = ${decision.dispatch_status}::channel_outbound_dispatch_status,
        delivery_status = ${decision.delivery_status}::channel_outbound_delivery_status,
        dispatched_at = CASE
          WHEN ${decision.dispatch_status}::text = 'DISPATCHED' THEN COALESCE(attempt.dispatched_at, ${input.now}::timestamptz)
          ELSE attempt.dispatched_at
        END,
        processing_lease_until = CASE
          WHEN ${decision.delivery_status}::text = 'PROCESSING' THEN ${processing_lease_until}::timestamptz
          ELSE NULL
        END,
        sent_at = CASE
          WHEN ${decision.delivery_status}::text = 'SENT' THEN ${input.now}::timestamptz
          ELSE NULL
        END,
        failed_at = CASE
          WHEN ${decision.delivery_status}::text = 'FAILED' THEN ${input.now}::timestamptz
          ELSE NULL
        END,
        failure_reason = ${failure_reason}::channel_outbound_failure_reason,
        provider_message_id = ${provider_message_id},
        updated_at = CURRENT_TIMESTAMP
      WHERE attempt.workspace_id = ${job.workspace_id}::uuid
        AND attempt.id = ${attempt_id}::uuid
        AND attempt.dispatch_status = ${current.dispatch_status}::channel_outbound_dispatch_status
        AND attempt.delivery_status = ${current.delivery_status}::channel_outbound_delivery_status
      RETURNING ${ATTEMPT_SELECT}
    `);
    const row = updated[0];
    if (!row) {
      throw new ChannelOutboundError("INVALID_TRANSITION");
    }

    if (decision.delivery_status === "SENT") {
      await transaction.$executeRaw(Prisma.sql`
        UPDATE opportunities
        SET
          first_contact_at = ${input.now}::timestamptz,
          updated_at = CURRENT_TIMESTAMP
        WHERE workspace_id = ${job.workspace_id}::uuid
          AND id = ${row.opportunity_id}::uuid
          AND first_contact_at IS NULL
      `);
      await insertMessageFact(transaction, {
        workspace_id: job.workspace_id,
        opportunity_id: row.opportunity_id,
        type: "WHATSAPP_OUTBOUND_SENT",
        occurred_at: input.now
      });
    } else if (decision.delivery_status === "FAILED") {
      await insertMessageFact(transaction, {
        workspace_id: job.workspace_id,
        opportunity_id: row.opportunity_id,
        type: "WHATSAPP_OUTBOUND_FAILED",
        occurred_at: input.now
      });
    }

    return toView(row);
  });
}

async function loadAttempt(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  attempt_id: string
): Promise<AttemptRow[]> {
  return transaction.$queryRaw<AttemptRow[]>(Prisma.sql`
    SELECT ${ATTEMPT_SELECT}
    FROM channel_outbound_attempts AS attempt
    WHERE attempt.workspace_id = ${workspace_id}::uuid
      AND attempt.id = ${attempt_id}::uuid
  `);
}

async function insertMessageFact(
  transaction: ScopedTransactionClient,
  input: {
    readonly workspace_id: string;
    readonly opportunity_id: string;
    readonly type: "WHATSAPP_OUTBOUND_SENT" | "WHATSAPP_OUTBOUND_FAILED";
    readonly occurred_at: Date | null;
  }
): Promise<void> {
  await transaction.$executeRaw(Prisma.sql`
    INSERT INTO opportunity_timeline_events (
      workspace_id, opportunity_id, type, lead_submission_id,
      integration_event_id, occurred_at
    )
    VALUES (
      ${input.workspace_id}::uuid,
      ${input.opportunity_id}::uuid,
      ${input.type}::opportunity_timeline_event_type,
      NULL,
      NULL,
      COALESCE(${input.occurred_at}::timestamptz, CURRENT_TIMESTAMP)
    )
  `);
}
