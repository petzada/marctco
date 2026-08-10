import { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type {
  IntakeDestination,
  IntakePlan,
  IntakeReviewPlan,
  SubmissionInsert,
  SubmissionKey
} from "@marctco/domain";
import type { AccessContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext, type ScopedTransactionClient } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

/**
 * The write half of ingestion. Two of the operations here accept **either**
 * context variant, because ingestion has two callers: the worker's job and the
 * "completar e liberar" handler in `apps/web` (ADR-0016, ADR-0017).
 *
 * None of them decides anything. The domain already decided; what is left is
 * to carry a plan into one transaction.
 */

/** What `applyIntakePlan` wrote, so a caller can look at it without a second read. */
export type AppliedIntakePlan =
  | { readonly kind: "QUARANTINE" }
  | { readonly kind: "RETRANSMISSION"; readonly opportunity_id: string }
  | {
      readonly kind: "NEW_OPPORTUNITY";
      readonly opportunity_id: string;
      readonly person_id: string;
    };

interface IdRow {
  readonly id: string;
}

/**
 * A `RETURNING` that came back empty is never "nothing to do" here — it means a
 * write the transaction depends on did not happen, and continuing would build
 * the rest of the plan on an id that does not exist.
 */
function firstRow<Row>(rows: readonly Row[], missing: string): Row {
  const row = rows[0];
  if (!row) {
    throw new Error(missing);
  }
  return row;
}

export interface RecordLeadSubmissionInput {
  readonly key: SubmissionKey;
  /**
   * The transmission being recorded. An argument rather than something read
   * off the context, because the release handler in `apps/web` carries a
   * `UserContext` and still points at the quarantined event it is completing.
   */
  readonly integration_event_id: string;
  /** Truth about the origin. Not the Opportunity's `arrived_at`. */
  readonly received_at: Date;
}

/**
 * Where an ingested lead lands: the connection's `target_pipeline_id` when it
 * declares one, otherwise the commercial pipeline with `is_default = true`, and
 * in both cases the stage whose **role** is `ENTRY` — never a stage found by
 * its label, which belongs to the customer and changes.
 *
 * There is no argument for a financing type and there is not going to be one.
 * That is what makes "the classification never selects a funnel, in any
 * hypothesis" a property of the signature rather than a rule to remember
 * (ADR-0009, ADR-0007 §Mecanismo 2).
 *
 * A `target_pipeline_id` that resolves to nothing throws instead of quietly
 * falling back to the default: under RLS a pipeline from another workspace is
 * simply not there, and silently routing that lead somewhere else would hide a
 * misconfigured connection behind correct-looking behaviour.
 */
export async function resolveIntakeDestination(
  context: AccessContext,
  target_pipeline_id: string | null,
  prisma: PrismaClient = sharedPrisma
): Promise<IntakeDestination> {
  if (target_pipeline_id !== null) {
    assertUuid(target_pipeline_id, "target_pipeline_id");
  }

  const chosen =
    target_pipeline_id === null
      ? Prisma.sql`pipeline.is_default = true AND pipeline.type = 'COMMERCIAL'`
      : Prisma.sql`pipeline.id = ${target_pipeline_id}::uuid`;

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<Array<{ pipeline_id: string; entry_stage_id: string }>>`
      SELECT pipeline.id AS pipeline_id, stage.id AS entry_stage_id
      FROM pipelines AS pipeline
      JOIN stages AS stage
        ON stage.workspace_id = pipeline.workspace_id
       AND stage.pipeline_id = pipeline.id
       AND stage.role = 'ENTRY'
      WHERE ${chosen}
    `
  );

  return firstRow(
    rows,
    target_pipeline_id === null
      ? "The workspace has no default commercial pipeline with an ENTRY stage"
      : "The connection's target pipeline is not a pipeline with an ENTRY stage in this workspace"
  );
}

/**
 * Phase two of ADR-0017: the insert whose result is an **input** of
 * `decideIntake`. It is the only thing in the system that answers "have I
 * already received this transmission".
 *
 * The mechanism is `INSERT … ON CONFLICT DO NOTHING RETURNING id`, and
 * deliberately not catching the unique violation: in Postgres an error aborts
 * the whole transaction, every later command answers `current transaction is
 * aborted`, and catching it in TypeScript does not undo that — the bad state is
 * on the server. Everything a retransmission still owes comes *after* the
 * detection, so catching would break the normal path with an error that does
 * not even mention duplication (ADR-0007 §Mecanismo 1).
 *
 * An empty `RETURNING` **is** the signal. The row is then read to learn the one
 * further fact the decision needs and the insert cannot report: whether the
 * earlier transmission left a card behind.
 */
export async function recordLeadSubmission(
  context: AccessContext,
  input: RecordLeadSubmissionInput,
  prisma: PrismaClient = sharedPrisma
): Promise<SubmissionInsert> {
  const { key } = input;
  assertUuid(input.integration_event_id, "integration_event_id");

  return withAccessContext(prisma, context, async (transaction) => {
    const inserted = await transaction.$queryRaw<IdRow[]>`
      INSERT INTO lead_submissions (
        workspace_id, source, external_lead_id, received_at,
        last_integration_event_id, updated_at
      )
      VALUES (
        ${context.workspace_id}::uuid,
        ${key.source}::lead_source,
        ${key.external_lead_id},
        ${input.received_at}::timestamptz,
        ${input.integration_event_id}::uuid,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT (workspace_id, source, external_lead_id) DO NOTHING
      RETURNING id
    `;

    const row = inserted[0];
    if (row) {
      return { kind: "INSERTED", lead_submission_id: row.id } as const;
    }

    const existing = await transaction.$queryRaw<
      Array<{ id: string; opportunity_id: string | null }>
    >`
      SELECT id, opportunity_id
      FROM lead_submissions
      WHERE source = ${key.source}::lead_source
        AND external_lead_id = ${key.external_lead_id}
    `;
    // An empty read here means the conflicting row belongs to a transaction
    // that has not committed yet, so this snapshot cannot see it. Failing is
    // the honest answer: the event is durable, the job is retried, and the
    // second attempt reads a committed row.
    const submission = firstRow(
      existing,
      "A concurrent transmission holds this submission key; the job will be retried"
    );
    return {
      kind: "DUPLICATE",
      lead_submission_id: submission.id,
      opportunity_id: submission.opportunity_id
    } as const;
  });
}

/**
 * The open, unmerged cards a Pessoa already has — the trigger of
 * `POSSIBLE_DUPLICATE`, read as data so the decision stays pure.
 *
 * A merged card is excluded because it is out of every active view: linking a
 * new lead to a tombstone would put the warning where nobody looks. Financing
 * data is not part of this question, and cannot be: it is what the screen shows
 * a human to tell two cards apart, never the condition for linking them
 * (ADR-0007 §Mecanismo 2).
 */
export async function findOpenOpportunitiesOfPerson(
  context: AccessContext,
  person_id: string | null,
  prisma: PrismaClient = sharedPrisma
): Promise<string[]> {
  // A Pessoa that is about to be created has no cards, and asking the database
  // to confirm that costs a transaction per new lead.
  if (person_id === null) {
    return [];
  }
  assertUuid(person_id, "person_id");

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<IdRow[]>`
      SELECT id
      FROM opportunities
      WHERE person_id = ${person_id}::uuid
        AND status = 'OPEN'
        AND merged_into_opportunity_id IS NULL
      ORDER BY arrived_at, id
    `
  );
  return rows.map((row) => row.id);
}

/**
 * Executes an `IntakePlan` in one transaction: an exhaustive `switch`, no
 * business rule, no decision (ADR-0016, ADR-0017). Every variant also settles
 * the event's own state, because `IntegrationEvent.status` is the single source
 * of the Integrações screen and a card that exists while the event still reads
 * `RECEIVED` is a lie the next reader has no way to detect.
 *
 * One transaction and not several: a Pessoa written without her card is a
 * record that never matches anything, and a card written without its submission
 * pointer would be resent into existence a second time.
 */
export async function applyIntakePlan(
  context: AccessContext,
  plan: IntakePlan,
  prisma: PrismaClient = sharedPrisma
): Promise<AppliedIntakePlan> {
  return withAccessContext(prisma, context, async (transaction) => {
    switch (plan.kind) {
      case "QUARANTINE": {
        // Still points the submission at the transmission being processed: a
        // quarantined envio that arrives again is completed from Integrações,
        // and the manager must be reading the payload that arrived last.
        await transaction.$executeRaw`
          UPDATE lead_submissions
          SET last_integration_event_id = ${plan.integration_event_id}::uuid,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${plan.lead_submission_id}::uuid
        `;
        await settleEvent(transaction, plan.integration_event_id, "QUARANTINED");
        return { kind: "QUARANTINE" } as const;
      }
      case "RETRANSMISSION": {
        // Points at the new transmission, counts it, and stops. There is no
        // field here for stage, responsible, status or arrived_at — which is
        // exactly why a resend cannot rewind the funnel.
        await transaction.$executeRaw`
          UPDATE lead_submissions
          SET last_integration_event_id = ${plan.integration_event_id}::uuid,
              transmission_count = transmission_count + 1,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${plan.lead_submission_id}::uuid
        `;
        await settleEvent(transaction, plan.integration_event_id, "PROCESSED");
        return { kind: "RETRANSMISSION", opportunity_id: plan.opportunity_id } as const;
      }
      case "NEW_OPPORTUNITY": {
        const person_id = await writePerson(transaction, context.workspace_id, plan);
        const opportunity_id = await writeOpportunity(
          transaction,
          context.workspace_id,
          person_id,
          plan
        );
        for (const review of plan.reviews) {
          await writeReview(transaction, context.workspace_id, opportunity_id, review);
        }

        // `opportunity_id IS NULL` in the WHERE is what makes this the *only*
        // card the submission can ever get, and it closes the one window the
        // three-phase shape opens: the insert commits in its own transaction,
        // so between that commit and this one the submission legitimately reads
        // as a duplicate with no card, and a second worker on the same key
        // would otherwise take the same recovery path and write a second card.
        // Only one transaction can claim the row; the loser touches nothing,
        // rolls back whole, and its retry reads a card and goes inert
        // (ADR-0013: a condition arbitrates a concurrent write).
        const claimed = await transaction.$executeRaw`
          UPDATE lead_submissions
          SET opportunity_id = ${opportunity_id}::uuid,
              last_integration_event_id = ${plan.integration_event_id}::uuid,
              updated_at = CURRENT_TIMESTAMP
          WHERE id = ${plan.lead_submission_id}::uuid
            AND opportunity_id IS NULL
        `;
        if (claimed === 0) {
          throw new Error(
            "The submission already produced an Opportunity; the job will be retried"
          );
        }
        await settleEvent(transaction, plan.integration_event_id, "PROCESSED");
        return { kind: "NEW_OPPORTUNITY", opportunity_id, person_id } as const;
      }
      default: {
        // The compiler proves the switch is total; this catches a variant added
        // to the plan without a branch here, at runtime, in the one place that
        // must never guess.
        const unhandled: never = plan;
        throw new Error(`Unhandled intake plan: ${JSON.stringify(unhandled)}`);
      }
    }
  });
}

/**
 * Creates or completes the Pessoa, then adds the submission's contacts.
 *
 * Everything here is additive. `PersonContacts` is always the submission's
 * complete set rather than a delta, the contact writes are inserts that do
 * nothing on conflict, and name and CPF are only ever filled in where there was
 * nothing — a Pessoa accumulates ways of being found, because that is how she
 * is recognised next time (ADR-0007 §Identidade).
 */
async function writePerson(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  plan: Extract<IntakePlan, { kind: "NEW_OPPORTUNITY" }>
): Promise<string> {
  const { contacts } = plan;
  let person_id: string;

  if (plan.person.kind === "REUSE") {
    person_id = plan.person.person_id;
    // COALESCE and never assignment: the decision that reused this Pessoa
    // already ruled out a contradicting CPF, so filling an empty column adds a
    // key, while overwriting a full one would be the "phone decides" rule
    // coming back through a different door.
    await transaction.$executeRaw`
      UPDATE persons
      SET name = COALESCE(name, ${contacts.name}),
          cpf = COALESCE(cpf, ${contacts.cpf}),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${person_id}::uuid
    `;
  } else {
    const created = await transaction.$queryRaw<IdRow[]>`
      INSERT INTO persons (workspace_id, name, cpf, updated_at)
      VALUES (
        ${workspace_id}::uuid,
        ${contacts.name},
        ${contacts.cpf},
        CURRENT_TIMESTAMP
      )
      RETURNING id
    `;
    person_id = firstRow(created, "Creating the Pessoa returned no row").id;
  }

  if (contacts.phones.length > 0) {
    await transaction.$executeRaw`
      INSERT INTO person_phones (workspace_id, person_id, phone_e164)
      SELECT ${workspace_id}::uuid, ${person_id}::uuid, phone
      FROM unnest(${[...contacts.phones]}::text[]) AS phone
      ON CONFLICT (person_id, phone_e164) DO NOTHING
    `;
  }
  if (contacts.emails.length > 0) {
    await transaction.$executeRaw`
      INSERT INTO person_emails (workspace_id, person_id, email)
      SELECT ${workspace_id}::uuid, ${person_id}::uuid, email
      FROM unnest(${[...contacts.emails]}::text[]) AS email
      ON CONFLICT (person_id, email) DO NOTHING
    `;
  }

  return person_id;
}

async function writeOpportunity(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  person_id: string,
  plan: Extract<IntakePlan, { kind: "NEW_OPPORTUNITY" }>
): Promise<string> {
  // `area` is COMMERCIAL and nothing else: ingestion never creates a legal
  // Opportunity. That is the handoff, and the handoff is always a human's
  // decision (ADR-0009).
  const created = await transaction.$queryRaw<IdRow[]>`
    INSERT INTO opportunities (
      workspace_id, person_id, pipeline_id, stage_id, area, status,
      arrived_at, missing_phone, financing_type, financial_institution,
      installment_amount, updated_at
    )
    VALUES (
      ${workspace_id}::uuid,
      ${person_id}::uuid,
      ${plan.pipeline_id}::uuid,
      ${plan.stage_id}::uuid,
      'COMMERCIAL',
      'OPEN',
      ${plan.arrived_at}::timestamptz,
      ${plan.missing_phone},
      ${plan.financing_type}::financing_type,
      ${plan.financial_institution},
      ${plan.installment_amount}::numeric,
      CURRENT_TIMESTAMP
    )
    RETURNING id
  `;
  return firstRow(created, "Creating the Opportunity returned no row").id;
}

async function writeReview(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  opportunity_id: string,
  review: IntakeReviewPlan
): Promise<void> {
  const candidate_person_ids =
    review.type === "IDENTITY_CONFLICT" ? [...review.candidate_person_ids] : [];
  const related_opportunity_id =
    review.type === "POSSIBLE_DUPLICATE" ? review.related_opportunity_id : null;

  await transaction.$executeRaw`
    INSERT INTO intake_reviews (
      workspace_id, opportunity_id, type, candidate_person_ids, related_opportunity_id
    )
    VALUES (
      ${workspace_id}::uuid,
      ${opportunity_id}::uuid,
      ${review.type}::intake_review_type,
      ${candidate_person_ids}::uuid[],
      ${related_opportunity_id}::uuid
    )
  `;
}

/**
 * The event's final state, written in the same transaction as the rows it
 * describes. A write that touches nothing means the event is not in the
 * workspace the caller claims, and that fails rather than reporting work that
 * never happened.
 */
async function settleEvent(
  transaction: ScopedTransactionClient,
  integration_event_id: string,
  status: "PROCESSED" | "QUARANTINED"
): Promise<void> {
  // `processed_at` belongs to PROCESSED and to nothing else — the schema says
  // so, and it is the right reading: an event in quarantine has not been
  // processed, it is waiting for a human to complete it. The instant is stamped
  // when the release finally produces a card.
  const processed_at =
    status === "PROCESSED"
      ? Prisma.sql`COALESCE(processed_at, CURRENT_TIMESTAMP)`
      : Prisma.sql`NULL`;

  const updated = await transaction.$executeRaw`
    UPDATE integration_events
    SET status = ${status}::integration_event_status,
        processed_at = ${processed_at},
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ${integration_event_id}::uuid
  `;
  if (updated === 0) {
    throw new Error("The integration event is not visible in the workspace its job claims");
  }
}
