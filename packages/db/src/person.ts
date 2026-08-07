import type { PrismaClient } from "@prisma/client";
import {
  lookupValuesOfKind,
  type PersonCandidate,
  type PersonLookupPlan
} from "@marctco/domain";
import type { AccessContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

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
  const cpfs = lookupValuesOfKind(plan, "CPF");
  const phones = lookupValuesOfKind(plan, "PHONE");
  const emails = lookupValuesOfKind(plan, "EMAIL");

  // A submission with nothing to look up cannot match anybody, and asking the
  // database to confirm that costs a transaction per empty lead.
  if (cpfs.length === 0 && phones.length === 0 && emails.length === 0) {
    return [];
  }

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<CandidateRow[]>`
      SELECT
        person.id AS person_id,
        person.cpf,
        (person.cpf IS NOT NULL AND person.cpf = ANY(${cpfs}::text[])) AS matched_cpf,
        EXISTS (
          SELECT 1 FROM person_phones AS phone
          WHERE phone.person_id = person.id
            AND phone.phone_e164 = ANY(${phones}::text[])
        ) AS matched_phone,
        EXISTS (
          SELECT 1 FROM person_emails AS email
          WHERE email.person_id = person.id
            AND email.email = ANY(${emails}::text[])
        ) AS matched_email
      FROM persons AS person
      WHERE person.merged_into_person_id IS NULL
        AND (
          (person.cpf IS NOT NULL AND person.cpf = ANY(${cpfs}::text[]))
          OR EXISTS (
            SELECT 1 FROM person_phones AS phone
            WHERE phone.person_id = person.id
              AND phone.phone_e164 = ANY(${phones}::text[])
          )
          OR EXISTS (
            SELECT 1 FROM person_emails AS email
            WHERE email.person_id = person.id
              AND email.email = ANY(${emails}::text[])
          )
        )
      ORDER BY person.id
      LIMIT ${MAX_CANDIDATES}::integer
    `
  );

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
