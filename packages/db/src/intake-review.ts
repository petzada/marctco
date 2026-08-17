import { Prisma, type PrismaClient } from "@prisma/client";
import {
  planPossibleDuplicateResolution,
  type PossibleDuplicateResolution,
  type PossibleDuplicateResolutionPlan
} from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
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
 * deliberately excluded; SUPERVISOR resolves only reviews carried by a lead
 * already assigned inside their tagged team (ADR-0015, ADR-0024).
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
    const row = await loadLockedPossibleDuplicate(
      transaction,
      context,
      input.review_id
    );

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
        AND workspace_id = ${context.workspace_id}::uuid
        AND resolution IS NULL
    `;
    if (claimed === 0) {
      throw new Error("The intake review was already resolved");
    }

    await deleteRedundantPendingPair(
      transaction,
      context.workspace_id,
      input.review_id,
      row
    );
    await applyPossibleDuplicateResolution(transaction, context.workspace_id, input.review_id, plan);
    return { review_id: input.review_id, resolution: plan.kind };
  });
}

async function loadLockedPossibleDuplicate(
  transaction: ScopedTransactionClient,
  context: UserContext,
  review_id: string
): Promise<PossibleDuplicateRow> {
  const { workspace_id } = context;
  const initial = await readNormalizedPossibleDuplicate(transaction, context, review_id, false);
  if (!initial) {
    throw new Error("The pending possible-duplicate review was not found");
  }

  // Every resolver and merge locks Opportunities first, in id order. That
  // gives overlapping pairs one global lock order before any review row is
  // claimed or deduplicated.
  const opportunities = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM opportunities
    WHERE workspace_id = ${workspace_id}::uuid
      AND id IN (${initial.opportunity_id}::uuid, ${initial.related_opportunity_id}::uuid)
    ORDER BY id
    FOR UPDATE
  `;
  if (opportunities.length !== 2) {
    throw new Error("Both possible-duplicate Opportunities must exist in this workspace");
  }

  const locked = await readNormalizedPossibleDuplicate(transaction, context, review_id, true);
  if (!locked) {
    throw new Error("The pending possible-duplicate review was not found");
  }
  if (
    locked.opportunity_id !== initial.opportunity_id
    || locked.related_opportunity_id !== initial.related_opportunity_id
  ) {
    throw new Error("The possible-duplicate pair changed concurrently; retry the resolution");
  }

  // Store the pair in the same orientation used by the decision: newest
  // Opportunity first, canonical/older Opportunity second. A legacy or
  // concurrently repointed review cannot invert the merge by swapping sides.
  await transaction.$executeRaw`
    UPDATE intake_reviews
    SET opportunity_id = ${locked.opportunity_id}::uuid,
        related_opportunity_id = ${locked.related_opportunity_id}::uuid
    WHERE id = ${review_id}::uuid
      AND workspace_id = ${workspace_id}::uuid
  `;
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM intake_reviews
    WHERE workspace_id = ${workspace_id}::uuid
      AND type = 'POSSIBLE_DUPLICATE'
      AND resolution IS NULL
      AND (
        (
          opportunity_id = ${locked.opportunity_id}::uuid
          AND related_opportunity_id = ${locked.related_opportunity_id}::uuid
        )
        OR (
          opportunity_id = ${locked.related_opportunity_id}::uuid
          AND related_opportunity_id = ${locked.opportunity_id}::uuid
        )
      )
    ORDER BY id
    FOR UPDATE
  `;
  return locked;
}

async function deleteRedundantPendingPair(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  resolved_review_id: string,
  pair: PossibleDuplicateRow
): Promise<void> {
  // Pending duplicates contain no author, instant or reason. The claimed row
  // is the audit record; deleting only its undecided duplicates prevents a
  // second marker from surviving NEW_FINANCING or SAME_FINANCING.
  await transaction.$executeRaw`
    DELETE FROM intake_reviews
    WHERE workspace_id = ${workspace_id}::uuid
      AND id <> ${resolved_review_id}::uuid
      AND type = 'POSSIBLE_DUPLICATE'
      AND resolution IS NULL
      AND (
        (
          opportunity_id = ${pair.opportunity_id}::uuid
          AND related_opportunity_id = ${pair.related_opportunity_id}::uuid
        )
        OR (
          opportunity_id = ${pair.related_opportunity_id}::uuid
          AND related_opportunity_id = ${pair.opportunity_id}::uuid
        )
      )
  `;
}

async function readNormalizedPossibleDuplicate(
  transaction: ScopedTransactionClient,
  context: UserContext,
  review_id: string,
  lock: boolean
): Promise<PossibleDuplicateRow | undefined> {
  const { workspace_id } = context;
  const lock_clause = lock ? Prisma.sql`FOR UPDATE OF review` : Prisma.empty;
  const rows = await transaction.$queryRaw<PossibleDuplicateRow[]>(Prisma.sql`
      SELECT
        CASE
          WHEN (opportunity.arrived_at, opportunity.id) > (related.arrived_at, related.id)
            THEN opportunity.id
          ELSE related.id
        END AS opportunity_id,
        CASE
          WHEN (opportunity.arrived_at, opportunity.id) > (related.arrived_at, related.id)
            THEN related.id
          ELSE opportunity.id
        END AS related_opportunity_id
      FROM intake_reviews AS review
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = review.workspace_id
       AND opportunity.id = review.opportunity_id
      JOIN opportunities AS related
        ON related.workspace_id = review.workspace_id
       AND related.id = review.related_opportunity_id
      WHERE review.id = ${review_id}::uuid
        AND review.workspace_id = ${workspace_id}::uuid
        AND review.type = 'POSSIBLE_DUPLICATE'
        ${opportunityScopeSql(context, "opportunity")}
      ${lock_clause}
  `);
  return rows[0];
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
            closed_at = CURRENT_TIMESTAMP,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ${plan.opportunity_id}::uuid
          AND workspace_id = ${workspace_id}::uuid
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
  const opportunities = await transaction.$queryRaw<
    Array<{ id: string; person_id: string; status: string; merged_into_opportunity_id: string | null }>
  >`
    SELECT id, person_id, status::text, merged_into_opportunity_id
    FROM opportunities
    WHERE workspace_id = ${workspace_id}::uuid
      AND id IN (
      ${plan.absorbed_opportunity_id}::uuid,
      ${plan.canonical_opportunity_id}::uuid
    )
    ORDER BY id
    FOR UPDATE
  `;
  if (
    opportunities.length !== 2
    || opportunities.some(
      (opportunity) => opportunity.status !== "OPEN" || opportunity.merged_into_opportunity_id !== null
    )
    || opportunities[0]?.person_id !== opportunities[1]?.person_id
  ) {
    throw new Error("Both possible-duplicate Opportunities must still be open, unmerged and belong to one Pessoa");
  }

  // The resolved review remains as the audit row, but its active link is gone.
  // Every other FK is transferred before the tombstone is written.
  await transaction.$executeRaw`
    UPDATE intake_reviews
    SET related_opportunity_id = NULL
    WHERE id = ${review_id}::uuid
      AND workspace_id = ${workspace_id}::uuid
  `;

  const conflicting_links = await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM intake_reviews
    WHERE workspace_id = ${workspace_id}::uuid
      AND related_opportunity_id = ${plan.absorbed_opportunity_id}::uuid
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
    WHERE workspace_id = ${workspace_id}::uuid
      AND related_opportunity_id = ${plan.absorbed_opportunity_id}::uuid
  `;
  await transaction.$executeRaw`
    UPDATE intake_reviews
    SET opportunity_id = ${plan.canonical_opportunity_id}::uuid
    WHERE workspace_id = ${workspace_id}::uuid
      AND opportunity_id = ${plan.absorbed_opportunity_id}::uuid
  `;
  await normalizeAndDeduplicatePendingReviews(
    transaction,
    workspace_id,
    plan.absorbed_opportunity_id,
    plan.canonical_opportunity_id
  );
  await transaction.$executeRaw`
    UPDATE opportunity_timeline_events
    SET opportunity_id = ${plan.canonical_opportunity_id}::uuid
    WHERE workspace_id = ${workspace_id}::uuid
      AND opportunity_id = ${plan.absorbed_opportunity_id}::uuid
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
    WHERE submission.workspace_id = ${workspace_id}::uuid
      AND submission.opportunity_id = ${plan.absorbed_opportunity_id}::uuid
    ON CONFLICT (workspace_id, type, integration_event_id) DO NOTHING
  `;
  await transaction.$executeRaw`
    UPDATE lead_submissions
    SET opportunity_id = ${plan.canonical_opportunity_id}::uuid,
        updated_at = CURRENT_TIMESTAMP
    WHERE workspace_id = ${workspace_id}::uuid
      AND opportunity_id = ${plan.absorbed_opportunity_id}::uuid
  `;

  const merged = await transaction.$executeRaw`
    UPDATE opportunities
    SET merged_into_opportunity_id = ${plan.canonical_opportunity_id}::uuid,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${plan.absorbed_opportunity_id}::uuid
      AND workspace_id = ${workspace_id}::uuid
      AND merged_into_opportunity_id IS NULL
      AND status = 'OPEN'
  `;
  if (merged !== 1) {
    throw new Error("The reviewed Opportunity was merged concurrently");
  }
}

async function normalizeAndDeduplicatePendingReviews(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  absorbed_opportunity_id: string,
  canonical_opportunity_id: string
): Promise<void> {
  await transaction.$queryRaw<Array<{ id: string }>>`
    SELECT id
    FROM intake_reviews
    WHERE workspace_id = ${workspace_id}::uuid
      AND type = 'POSSIBLE_DUPLICATE'
      AND resolution IS NULL
      AND (
        opportunity_id IN (
          ${absorbed_opportunity_id}::uuid,
          ${canonical_opportunity_id}::uuid
        )
        OR related_opportunity_id IN (
          ${absorbed_opportunity_id}::uuid,
          ${canonical_opportunity_id}::uuid
        )
      )
    ORDER BY id
    FOR UPDATE
  `;

  // A second undecided review of the pair being merged becomes a self-link.
  // It has no audit decision to preserve and cannot remain a marker.
  await transaction.$executeRaw`
    DELETE FROM intake_reviews
    WHERE workspace_id = ${workspace_id}::uuid
      AND type = 'POSSIBLE_DUPLICATE'
      AND resolution IS NULL
      AND opportunity_id = related_opportunity_id
      AND opportunity_id = ${canonical_opportunity_id}::uuid
  `;

  await transaction.$executeRaw`
    WITH normalized AS (
      SELECT
        review.id,
        CASE
          WHEN (opportunity.arrived_at, opportunity.id) > (related.arrived_at, related.id)
            THEN opportunity.id
          ELSE related.id
        END AS newer_opportunity_id,
        CASE
          WHEN (opportunity.arrived_at, opportunity.id) > (related.arrived_at, related.id)
            THEN related.id
          ELSE opportunity.id
        END AS older_opportunity_id
      FROM intake_reviews AS review
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = review.workspace_id
       AND opportunity.id = review.opportunity_id
      JOIN opportunities AS related
        ON related.workspace_id = review.workspace_id
       AND related.id = review.related_opportunity_id
      WHERE review.workspace_id = ${workspace_id}::uuid
        AND review.type = 'POSSIBLE_DUPLICATE'
        AND review.resolution IS NULL
        AND (
          review.opportunity_id = ${canonical_opportunity_id}::uuid
          OR review.related_opportunity_id = ${canonical_opportunity_id}::uuid
        )
    )
    UPDATE intake_reviews AS review
    SET opportunity_id = normalized.newer_opportunity_id,
        related_opportunity_id = normalized.older_opportunity_id
    FROM normalized
    WHERE review.id = normalized.id
      AND review.workspace_id = ${workspace_id}::uuid
  `;

  await transaction.$executeRaw`
    WITH redundant AS (
      SELECT id
      FROM (
        SELECT
          id,
          row_number() OVER (
            PARTITION BY opportunity_id, related_opportunity_id
            ORDER BY created_at, id
          ) AS position
        FROM intake_reviews
        WHERE workspace_id = ${workspace_id}::uuid
          AND type = 'POSSIBLE_DUPLICATE'
          AND resolution IS NULL
          AND (
            opportunity_id = ${canonical_opportunity_id}::uuid
            OR related_opportunity_id = ${canonical_opportunity_id}::uuid
          )
      ) AS ranked
      WHERE position > 1
    )
    DELETE FROM intake_reviews AS review
    USING redundant
    WHERE review.id = redundant.id
      AND review.workspace_id = ${workspace_id}::uuid
      AND review.resolution IS NULL
  `;
}
