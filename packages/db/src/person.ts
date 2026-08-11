import type { PrismaClient } from "@prisma/client";
import {
  lookupValuesOfKind,
  type PersonCandidate,
  type PersonLookupPlan
} from "@marctco/domain";
import type { AccessContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  withAccessContext,
  type ScopedTransactionClient
} from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

/**
 * More than a handful of Pessoas answering to one submission is not a
 * resolution problem, it is a data problem — and the decision only needs to
 * know "one" from "more than one" (ADR-0007 §Identidade). The cap keeps a
 * recycled phone number from turning the hottest read in ingestion into a scan
 * of somebody's whole customer base.
 */
const MAX_CANDIDATES = 50;

export type { PersonCandidate };

/**
 * Executes a `PersonLookupPlan`. One of the two operations in `packages/db`
 * that accept **either** context variant, because ingestion has two callers:
 * the worker's job and the "completar e liberar" handler in `apps/web`
 * (ADR-0016, ADR-0017).
 *
 * The domain decided *what* to search for and how strong each key is; this
 * decides nothing. It reports, per Pessoa, which kinds of key matched — and the
 * Pessoa's own CPF, so the arbitration can see a contradiction without a second
 * round trip.
 *
 * Merged Pessoas are excluded. A tombstone keeps no contacts, so it should
 * never match anything — but if one ever did, reusing it would write onto a row
 * that the merge just took out of every active view, and nobody would see the
 * lead again (ADR-0007 §Mesclagem).
 */
export async function findPersonCandidates(
  context: AccessContext,
  plan: PersonLookupPlan,
  prisma: PrismaClient = sharedPrisma
): Promise<PersonCandidate[]> {
  // Preserve the cheap public seam: an empty domain plan has no candidate by
  // construction and must not open a transaction merely to rediscover that.
  if (plan.keys.length === 0) {
    return [];
  }

  return withAccessContext(prisma, context, (transaction) =>
    findPersonCandidatesInTransaction(transaction, context.workspace_id, plan)
  );
}

/** Internal form used when intake must keep lookup and write in one snapshot. */
export async function findPersonCandidatesInTransaction(
  transaction: ScopedTransactionClient,
  workspace_id: string,
  plan: PersonLookupPlan
): Promise<PersonCandidate[]> {
  const cpfs = lookupValuesOfKind(plan, "CPF");
  const phones = lookupValuesOfKind(plan, "PHONE");
  const emails = lookupValuesOfKind(plan, "EMAIL");

  // A submission with nothing to look up cannot match anybody, and asking the
  // database to confirm that costs a transaction per empty lead.
  if (cpfs.length === 0 && phones.length === 0 && emails.length === 0) {
    return [];
  }

  // Each key kind is looked up once, off the index that leads with
  // `workspace_id` — the column RLS has already pinned — and the result serves
  // twice: as the set of Pessoas worth returning, and as the answer to "which
  // kind matched". Written out in both places instead, one copy eventually
  // stops agreeing with the other and a row comes back claiming it matched
  // nothing.
  //
  // The lookups drive, and `persons` is reached by id afterwards. Starting
  // from `persons` and testing each row would make the hottest read in
  // ingestion grow with the size of the customer base rather than with the
  // number of keys in the submission.
  const rows = await transaction.$queryRaw<CandidateRow[]>`
      WITH matched_by_cpf AS (
        SELECT id AS person_id
        FROM persons
        WHERE workspace_id = ${workspace_id}::uuid
          AND cpf = ANY(${cpfs}::text[])
      ),
      matched_by_phone AS (
        SELECT person_id
        FROM person_phones
        WHERE workspace_id = ${workspace_id}::uuid
          AND phone_e164 = ANY(${phones}::text[])
      ),
      matched_by_email AS (
        SELECT person_id
        FROM person_emails
        WHERE workspace_id = ${workspace_id}::uuid
          AND email = ANY(${emails}::text[])
      ),
      candidate AS (
        SELECT person_id FROM matched_by_cpf
        UNION SELECT person_id FROM matched_by_phone
        UNION SELECT person_id FROM matched_by_email
      )
      SELECT
        person.id AS person_id,
        person.cpf,
        EXISTS (SELECT 1 FROM matched_by_cpf AS m WHERE m.person_id = person.id) AS matched_cpf,
        EXISTS (SELECT 1 FROM matched_by_phone AS m WHERE m.person_id = person.id) AS matched_phone,
        EXISTS (SELECT 1 FROM matched_by_email AS m WHERE m.person_id = person.id) AS matched_email
      FROM candidate
      JOIN persons AS person ON person.id = candidate.person_id
      WHERE person.workspace_id = ${workspace_id}::uuid
        AND person.merged_into_person_id IS NULL
      ORDER BY person.id
      LIMIT ${MAX_CANDIDATES}::integer
    `;

  return rows.map((row) => ({
    person_id: row.person_id,
    cpf: row.cpf,
    matched: {
      cpf: row.matched_cpf,
      phone: row.matched_phone,
      email: row.matched_email
    }
  }));
}

interface CandidateRow {
  readonly person_id: string;
  readonly cpf: string | null;
  readonly matched_cpf: boolean;
  readonly matched_phone: boolean;
  readonly matched_email: boolean;
}
