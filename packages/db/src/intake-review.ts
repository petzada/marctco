import type { PrismaClient } from "@prisma/client";
import {
  planPossibleDuplicateResolution,
  type PossibleDuplicateResolution,
  type PossibleDuplicateResolutionPlan
} from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext, type ScopedTransactionClient } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export interface ResolveIntakeReviewInput {
  readonly review_id: string;
  readonly resolution: PossibleDuplicateResolution;
  readonly reason: string;
  readonly resolved_at: Date;
}

export interface ResolvedIntakeReview {
  readonly review_id: string;
  readonly resolution: PossibleDuplicateResolution;
}

interface PossibleDuplicateRow {
  readonly opportunity_id: string;
  readonly related_opportunity_id: string;
}

/**
 * Resolves a marker under the browser's validated tenant context. ATTENDANT is
 * deliberately excluded; SUPERVISOR has MANAGER scope until tags arrive in
 * Fase 2 (ADR-0015).
 */
export async function resolveIntakeReview(
  context: UserContext,
  input: ResolveIntakeReviewInput,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedIntakeReview> {
  assertUuid(input.review_id, "review_id");
  if (context.role === "ATTENDANT") {
    throw new Error("ATTENDANT cannot resolve an intake review");
  }
  if (!(input.resolved_at instanceof Date) || Number.isNaN(input.resolved_at.getTime())) {
    throw new Error("resolved_at must be a valid Date");
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<PossibleDuplicateRow[]>`
      SELECT opportunity_id, related_opportunity_id
      FROM intake_reviews
      WHERE id = ${input.review_id}::uuid
        AND type = 'POSSIBLE_DUPLICATE'
    `;
    const row = rows[0];
    if (!row?.related_opportunity_id) {
      throw new Error("The pending possible-duplicate review was not found");
    }

    const plan = planPossibleDuplicateResolution({
      opportunity_id: row.opportunity_id,
      related_opportunity_id: row.related_opportunity_id,
      resolution: input.resolution,
      resolved_by_user_id: context.user_id,
      resolved_at: input.resolved_at,
      reason: input.reason
    });

    const claimed = await transaction.$executeRaw`
      UPDATE intake_reviews
      SET resolution = ${plan.kind}::possible_duplicate_resolution,
          resolved_by_user_id = ${plan.resolved_by_user_id}::uuid,
          resolved_at = ${plan.resolved_at}::timestamptz,
          resolution_reason = ${plan.reason}
      WHERE id = ${input.review_id}::uuid
        AND resolution IS NULL
    `;
    if (claimed === 0) {
      throw new Error("The intake review was already resolved");
    }

    await applyPossibleDuplicateResolution(transaction, context.workspace_id, input.review_id, plan);
    return { review_id: input.review_id, resolution: plan.kind };
  });
}

async function applyPossibleDuplicateResolution(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  review_id: string,
  plan: PossibleDuplicateResolutionPlan
): Promise<void> {
  switch (plan.kind) {
    case "NEW_FINANCING":
      return;
    case "SAME_FINANCING": {
      await mergeOpportunities(transaction, workspace_id, review_id, plan);
      return;
    }
    case "INVALID_OR_SPAM": {
      // `LOST` removes the invalid card from the active funnel without
      // deleting it. The specific archival reason remains on the review audit
      // instead of overloading the generic loss reason owned by Fase 2.
      const archived = await transaction.$executeRaw`
        UPDATE opportunities
        SET status = 'LOST',
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${plan.opportunity_id}::uuid
          AND status = 'OPEN'
          AND merged_into_opportunity_id IS NULL
      `;
      if (archived !== 1) {
        throw new Error("The invalid or spam Opportunity is no longer active");
      }
      return;
    }
    default: {
      const unhandled: never = plan;
      throw new Error(`Unhandled possible-duplicate resolution: ${JSON.stringify(unhandled)}`);
    }
  }
}

async function mergeOpportunities(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  review_id: string,
  plan: Extract<PossibleDuplicateResolutionPlan, { kind: "SAME_FINANCING" }>
): Promise<void> {
  // Locks are always acquired by id, so two overlapping merge attempts cannot
  // take the pair in opposite order and deadlock.
  const cards = await transaction.$queryRaw<
    Array<{ id: string; person_id: string; status: string; merged_into_opportunity_id: string | null }>
  >`
    SELECT id, person_id, status::text, merged_into_opportunity_id
    FROM opportunities
    WHERE id IN (
      ${plan.absorbed_opportunity_id}::uuid,
      ${plan.canonical_opportunity_id}::uuid
    )
    ORDER BY id
    FOR UPDATE
  `;
  if (
    cards.length !== 2
    || cards.some((card) => card.status !== "OPEN" || card.merged_into_opportunity_id !== null)
    || cards[0]?.person_id !== cards[1]?.person_id
  ) {
    throw new Error("Both possible-duplicate Opportunities must still be open, unmerged and belong to one Pessoa");
  }

  // The resolved review remains as the audit row, but its active link is gone.
  // Every other FK is transferred before the tombstone is written.
  await transaction.$executeRaw`
    UPDATE intake_reviews
    SET related_opportunity_id = NULL
    WHERE id = ${review_id}::uuid
  `;

  const conflicting_links = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM intake_reviews
    WHERE related_opportunity_id = ${plan.absorbed_opportunity_id}::uuid
      AND opportunity_id = ${plan.canonical_opportunity_id}::uuid
      AND resolution IS NULL
    FOR UPDATE
  `;
  if (conflicting_links.length > 0) {
    throw new Error("A pending review still points from the canonical card to the card being merged");
  }

  await transaction.$executeRaw`
    UPDATE intake_reviews
    SET related_opportunity_id = ${plan.canonical_opportunity_id}::uuid
    WHERE related_opportunity_id = ${plan.absorbed_opportunity_id}::uuid
  `;
  await transaction.$executeRaw`
    UPDATE intake_reviews
    SET opportunity_id = ${plan.canonical_opportunity_id}::uuid
    WHERE opportunity_id = ${plan.absorbed_opportunity_id}::uuid
  `;
  await transaction.$executeRaw`
    UPDATE opportunity_timeline_events
    SET opportunity_id = ${plan.canonical_opportunity_id}::uuid
    WHERE opportunity_id = ${plan.absorbed_opportunity_id}::uuid
  `;

  // Each transferred submission becomes one visible re-entry fact on the
  // canonical card. The payload remains only on its IntegrationEvent.
  await transaction.$executeRaw`
    INSERT INTO opportunity_timeline_events (
      workspace_id, opportunity_id, type, lead_submission_id,
      integration_event_id, occurred_at
    )
    SELECT
      ${workspace_id}::uuid,
      ${plan.canonical_opportunity_id}::uuid,
      'SUBMISSION_REENTERED',
      submission.id,
      submission.last_integration_event_id,
      ${plan.resolved_at}::timestamptz
    FROM lead_submissions AS submission
    WHERE submission.opportunity_id = ${plan.absorbed_opportunity_id}::uuid
    ON CONFLICT (workspace_id, type, integration_event_id) DO NOTHING
  `;
  await transaction.$executeRaw`
    UPDATE lead_submissions
    SET opportunity_id = ${plan.canonical_opportunity_id}::uuid,
        updated_at = CURRENT_TIMESTAMP
    WHERE opportunity_id = ${plan.absorbed_opportunity_id}::uuid
  `;

  const merged = await transaction.$executeRaw`
    UPDATE opportunities
    SET merged_into_opportunity_id = ${plan.canonical_opportunity_id}::uuid,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${plan.absorbed_opportunity_id}::uuid
      AND merged_into_opportunity_id IS NULL
      AND status = 'OPEN'
  `;
  if (merged !== 1) {
    throw new Error("The reviewed Opportunity was merged concurrently");
  }
}
