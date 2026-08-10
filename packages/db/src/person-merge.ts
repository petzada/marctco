import type { PrismaClient } from "@prisma/client";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export interface MergePersonsInput {
  readonly absorbed_person_id: string;
  readonly canonical_person_id: string;
}

export interface MergedPersons {
  readonly absorbed_person_id: string;
  readonly canonical_person_id: string;
}

/**
 * Transfers everything hanging from one Pessoa, leaves its tombstone, then
 * re-evaluates the open cards that now belong to the canonical Pessoa. It
 * intentionally stays internal to `packages/db`: the future identity-review
 * branch of `resolveIntakeReview` calls it instead of exporting a thirteenth
 * database operation that ADR-0016 did not approve for this slice.
 */
export async function mergePersons(
  context: UserContext,
  input: MergePersonsInput,
  prisma: PrismaClient = sharedPrisma
): Promise<MergedPersons> {
  assertUuid(input.absorbed_person_id, "absorbed_person_id");
  assertUuid(input.canonical_person_id, "canonical_person_id");
  if (input.absorbed_person_id === input.canonical_person_id) {
    throw new Error("A Pessoa cannot be merged into herself");
  }
  if (context.role === "ATTENDANT") {
    throw new Error("ATTENDANT cannot merge Pessoas");
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const persons = await transaction.$queryRaw<
      Array<{ id: string; merged_into_person_id: string | null }>
    >`
      SELECT id, merged_into_person_id
      FROM persons
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND id IN (${input.absorbed_person_id}::uuid, ${input.canonical_person_id}::uuid)
      ORDER BY id
      FOR UPDATE
    `;
    if (persons.length !== 2 || persons.some((person) => person.merged_into_person_id !== null)) {
      throw new Error("Both Pessoas must still be active in this workspace");
    }

    // Fill only blanks on the canonical row. Conflicting identifiers remain on
    // the tombstone as audit facts; the human merge does not overwrite either.
    await transaction.$executeRaw`
      UPDATE persons AS canonical
      SET name = COALESCE(canonical.name, absorbed.name),
          cpf = COALESCE(canonical.cpf, absorbed.cpf),
          updated_at = CURRENT_TIMESTAMP
      FROM persons AS absorbed
      WHERE canonical.id = ${input.canonical_person_id}::uuid
        AND canonical.workspace_id = ${context.workspace_id}::uuid
        AND absorbed.id = ${input.absorbed_person_id}::uuid
        AND absorbed.workspace_id = ${context.workspace_id}::uuid
    `;

    // Exact duplicate values already survive on the canonical Pessoa. Remove
    // only the redundant row, then transfer every remaining contact row.
    await transaction.$executeRaw`
      DELETE FROM person_phones AS absorbed
      USING person_phones AS canonical
      WHERE absorbed.person_id = ${input.absorbed_person_id}::uuid
        AND absorbed.workspace_id = ${context.workspace_id}::uuid
        AND canonical.person_id = ${input.canonical_person_id}::uuid
        AND canonical.workspace_id = ${context.workspace_id}::uuid
        AND canonical.phone_e164 = absorbed.phone_e164
    `;
    await transaction.$executeRaw`
      UPDATE person_phones
      SET person_id = ${input.canonical_person_id}::uuid
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND person_id = ${input.absorbed_person_id}::uuid
    `;
    await transaction.$executeRaw`
      DELETE FROM person_emails AS absorbed
      USING person_emails AS canonical
      WHERE absorbed.person_id = ${input.absorbed_person_id}::uuid
        AND absorbed.workspace_id = ${context.workspace_id}::uuid
        AND canonical.person_id = ${input.canonical_person_id}::uuid
        AND canonical.workspace_id = ${context.workspace_id}::uuid
        AND canonical.email = absorbed.email
    `;
    await transaction.$executeRaw`
      UPDATE person_emails
      SET person_id = ${input.canonical_person_id}::uuid
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND person_id = ${input.absorbed_person_id}::uuid
    `;
    await transaction.$executeRaw`
      UPDATE opportunities
      SET person_id = ${input.canonical_person_id}::uuid,
          updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND person_id = ${input.absorbed_person_id}::uuid
    `;

    // Candidate ids are evidence rather than FKs, but leaving a merged Pessoa
    // there would offer an invalid merge target to the resolver.
    await transaction.$executeRaw`
      UPDATE intake_reviews
      SET candidate_person_ids = ARRAY(
        SELECT DISTINCT
          CASE
            WHEN candidate = ${input.absorbed_person_id}::uuid
              THEN ${input.canonical_person_id}::uuid
            ELSE candidate
          END
        FROM unnest(candidate_person_ids) AS candidate
        ORDER BY 1
      )
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND ${input.absorbed_person_id}::uuid = ANY(candidate_person_ids)
    `;

    const merged = await transaction.$executeRaw`
      UPDATE persons
      SET merged_into_person_id = ${input.canonical_person_id}::uuid,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.absorbed_person_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
        AND merged_into_person_id IS NULL
    `;
    if (merged !== 1) {
      throw new Error("The Pessoa was merged concurrently");
    }

    // Only pairs that have never been linked are born here. A resolved
    // NEW_FINANCING remains a human decision and is not reopened by a later
    // identity merge.
    await transaction.$executeRaw`
      INSERT INTO intake_reviews (
        workspace_id, opportunity_id, type, candidate_person_ids,
        related_opportunity_id
      )
      SELECT
        ${context.workspace_id}::uuid,
        newer.id,
        'POSSIBLE_DUPLICATE',
        '{}'::uuid[],
        older.id
      FROM opportunities AS newer
      JOIN opportunities AS older
        ON older.workspace_id = newer.workspace_id
       AND older.person_id = newer.person_id
       AND older.id <> newer.id
       AND (older.arrived_at, older.id) < (newer.arrived_at, newer.id)
      WHERE newer.workspace_id = ${context.workspace_id}::uuid
        AND newer.person_id = ${input.canonical_person_id}::uuid
        AND newer.status = 'OPEN'
        AND older.status = 'OPEN'
        AND newer.merged_into_opportunity_id IS NULL
        AND older.merged_into_opportunity_id IS NULL
        AND NOT EXISTS (
          SELECT 1
          FROM intake_reviews AS existing
          WHERE existing.workspace_id = ${context.workspace_id}::uuid
            AND existing.type = 'POSSIBLE_DUPLICATE'
            AND (
              (
                existing.opportunity_id = newer.id
                AND existing.related_opportunity_id = older.id
              )
              OR (
                existing.opportunity_id = older.id
                AND existing.related_opportunity_id = newer.id
              )
            )
        )
    `;

    return input;
  });
}
