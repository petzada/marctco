import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  FinancingType as PrismaFinancingType,
  LeadSource as PrismaLeadSource
} from "@prisma/client";
import {
  normalizeCpf,
  normalizeDecimalAmount,
  normalizeEmail,
  readPhone,
  type Marker
} from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { withAccessContext, type ScopedTransactionClient } from "./internal/scoped-transaction.js";
import { mergePersonsInTransaction } from "./person-merge.js";

const sharedPrisma = createPrismaClient();
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 200;

export type FinancingType = PrismaFinancingType;
export type LeadSource = PrismaLeadSource;

/**
 * `listLeads`, `countLeadsByMarker`, `getLead`, `assignLead` and the two
 * write operations below close the Leads screen's named-operation debt
 * carried from ticket 03: keyset, partial index and `ATTENDANT` scope live
 * here, never in `apps/web`, so a screen that could write `skip:` cannot
 * exist (ADR-0013, ADR-0016).
 */

// ---------------------------------------------------------------------------
// listLeads
// ---------------------------------------------------------------------------

export interface LeadListCursor {
  readonly arrived_at: Date;
  readonly id: string;
}

export interface LeadReviewMarker {
  readonly id: string;
  readonly type: "IDENTITY_CONFLICT" | "POSSIBLE_DUPLICATE";
}

export interface LeadListRow {
  readonly opportunity_id: string;
  readonly person_id: string;
  readonly name: string | null;
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly financing_type: FinancingType | null;
  readonly financial_institution: string | null;
  /** Canonical decimal string, the same shape `normalize()` produces. */
  readonly installment_amount: string | null;
  readonly campaign_id: string | null;
  readonly campaign_name: string | null;
  readonly form_id: string | null;
  readonly form_name: string | null;
  readonly arrived_at: Date;
  readonly missing_phone: boolean;
  readonly assigned_user_id: string | null;
  readonly source: LeadSource | null;
  /**
   * Unresolved reviews only — everything `markersFor` needs, and nothing it
   * has to fetch itself. The row never carries a marker list of its own: the
   * row, the card and the comparison all call the same `markersFor` on this
   * data (ADR-0018).
   */
  readonly reviews: readonly LeadReviewMarker[];
}

export interface ListLeadsOptions {
  readonly limit?: number;
  readonly after?: LeadListCursor;
  /** Filters the table in place — the same question a counter answers. */
  readonly marker?: Marker;
}

interface LeadListRawRow {
  readonly opportunity_id: string;
  readonly person_id: string;
  readonly name: string | null;
  readonly phones: string[] | null;
  readonly emails: string[] | null;
  readonly financing_type: string | null;
  readonly financial_institution: string | null;
  readonly installment_amount: string | null;
  readonly campaign_id: string | null;
  readonly campaign_name: string | null;
  readonly form_id: string | null;
  readonly form_name: string | null;
  readonly arrived_at: Date;
  readonly missing_phone: boolean;
  readonly assigned_user_id: string | null;
  readonly source: string | null;
  readonly reviews: LeadReviewMarker[] | null;
}

/**
 * Financing data is never the trigger, it is what a human uses to tell two
 * cards apart (ADR-0007 §Mecanismo 2). This filter answers "which leads have
 * this marker", the counter's question — it never calls `markersFor`, which
 * answers "what does this one lead have" (ADR-0018).
 */
function markerFilterSql(marker: Marker | undefined): Prisma.Sql {
  switch (marker) {
    case undefined:
      return Prisma.empty;
    case "MISSING_PHONE":
      return Prisma.sql`AND opportunity.missing_phone = true`;
    case "IDENTITY_CONFLICT":
      return Prisma.sql`
        AND EXISTS (
          SELECT 1 FROM intake_reviews AS review
          WHERE review.workspace_id = opportunity.workspace_id
            AND review.opportunity_id = opportunity.id
            AND review.type = 'IDENTITY_CONFLICT'
            AND review.resolution IS NULL
            AND review.identity_conflict_resolution IS NULL
        )
      `;
    case "POSSIBLE_DUPLICATE":
      return Prisma.sql`
        AND EXISTS (
          SELECT 1 FROM intake_reviews AS review
          WHERE review.workspace_id = opportunity.workspace_id
            AND review.opportunity_id = opportunity.id
            AND review.type = 'POSSIBLE_DUPLICATE'
            AND review.resolution IS NULL
        )
      `;
    default: {
      const unhandled: never = marker;
      throw new Error(`Unhandled marker filter: ${JSON.stringify(unhandled)}`);
    }
  }
}

function toLeadListRow(row: LeadListRawRow): LeadListRow {
  return {
    opportunity_id: row.opportunity_id,
    person_id: row.person_id,
    name: row.name,
    phones: row.phones ?? [],
    emails: row.emails ?? [],
    financing_type: (row.financing_type as FinancingType | null) ?? null,
    financial_institution: row.financial_institution,
    installment_amount: row.installment_amount,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    form_id: row.form_id,
    form_name: row.form_name,
    arrived_at: row.arrived_at,
    missing_phone: row.missing_phone,
    assigned_user_id: row.assigned_user_id,
    source: (row.source as LeadSource | null) ?? null,
    reviews: row.reviews ?? []
  };
}

/**
 * The Leads table's only query. Keyset by `(arrived_at DESC, id DESC)`, never
 * `OFFSET` — a lead arrives every few minutes, and `OFFSET` would shift the
 * page under a gestor mid-triage (ADR-0013). Merged Opportunities never
 * appear. Every row carries what `markersFor` needs, the financing
 * discriminators, campaign and form, and the lead's origin, so the screen
 * never issues a second query per row.
 */
export async function listLeads(
  context: UserContext,
  options: ListLeadsOptions = {},
  prisma: PrismaClient = sharedPrisma
): Promise<LeadListRow[]> {
  const limit = options.limit ?? DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_PAGE_SIZE) {
    throw new Error(`limit must be an integer between 1 and ${MAX_PAGE_SIZE}`);
  }
  if (options.after) {
    assertUuid(options.after.id, "after.id");
    if (Number.isNaN(options.after.arrived_at.getTime())) {
      throw new Error("after.arrived_at must be a valid instant");
    }
  }

  const after = options.after;
  const cursorClause = after
    ? Prisma.sql`AND (opportunity.arrived_at, opportunity.id) < (${after.arrived_at}::timestamptz, ${after.id}::uuid)`
    : Prisma.empty;

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<LeadListRawRow[]>(Prisma.sql`
      SELECT
        opportunity.id AS opportunity_id,
        opportunity.person_id,
        person.name,
        COALESCE(phones.values, ARRAY[]::text[]) AS phones,
        COALESCE(emails.values, ARRAY[]::text[]) AS emails,
        opportunity.financing_type::text AS financing_type,
        opportunity.financial_institution,
        opportunity.installment_amount::text AS installment_amount,
        opportunity.campaign_id,
        opportunity.campaign_name,
        opportunity.form_id,
        opportunity.form_name,
        opportunity.arrived_at,
        opportunity.missing_phone,
        opportunity.assigned_user_id,
        origin.source::text AS source,
        COALESCE(reviews.items, '[]'::jsonb) AS reviews
      FROM opportunities AS opportunity
      JOIN persons AS person
        ON person.workspace_id = opportunity.workspace_id AND person.id = opportunity.person_id
      LEFT JOIN LATERAL (
        SELECT array_agg(phone_e164 ORDER BY created_at) AS values
        FROM person_phones
        WHERE workspace_id = opportunity.workspace_id AND person_id = opportunity.person_id
      ) AS phones ON true
      LEFT JOIN LATERAL (
        SELECT array_agg(email ORDER BY created_at) AS values
        FROM person_emails
        WHERE workspace_id = opportunity.workspace_id AND person_id = opportunity.person_id
      ) AS emails ON true
      LEFT JOIN LATERAL (
        SELECT source
        FROM lead_submissions
        WHERE workspace_id = opportunity.workspace_id AND opportunity_id = opportunity.id
        ORDER BY received_at ASC, id ASC
        LIMIT 1
      ) AS origin ON true
      LEFT JOIN LATERAL (
        SELECT jsonb_agg(jsonb_build_object('id', id, 'type', type) ORDER BY created_at) AS items
        FROM intake_reviews
        WHERE workspace_id = opportunity.workspace_id
          AND opportunity_id = opportunity.id
          AND resolution IS NULL
          AND identity_conflict_resolution IS NULL
      ) AS reviews ON true
      WHERE opportunity.merged_into_opportunity_id IS NULL
        ${opportunityScopeSql(context, "opportunity")}
        ${cursorClause}
        ${markerFilterSql(options.marker)}
      ORDER BY opportunity.arrived_at DESC, opportunity.id DESC
      LIMIT ${limit}::integer
    `)
  );

  return rows.map(toLeadListRow);
}

// ---------------------------------------------------------------------------
// countLeadsByMarker
// ---------------------------------------------------------------------------

export interface LeadMarkerCounts {
  readonly MISSING_PHONE: number;
  readonly IDENTITY_CONFLICT: number;
  readonly POSSIBLE_DUPLICATE: number;
}

interface LeadMarkerCountsRawRow {
  readonly missing_phone: bigint;
  readonly identity_conflict: bigint;
  readonly possible_duplicate: bigint;
}

/**
 * "Which leads have this marker" — answered over the partial index for each
 * marker, never over `markersFor` on a loaded page (ADR-0018): that would
 * count only the page, or force loading the whole table to count it.
 */
export async function countLeadsByMarker(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<LeadMarkerCounts> {
  const scope = opportunityScopeSql(context, "opportunity");

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<LeadMarkerCountsRawRow[]>(Prisma.sql`
      SELECT
        (
          SELECT COUNT(*) FROM opportunities AS opportunity
          WHERE opportunity.workspace_id = ${context.workspace_id}::uuid
            AND opportunity.merged_into_opportunity_id IS NULL
            AND opportunity.missing_phone = true
            ${scope}
        ) AS missing_phone,
        (
          SELECT COUNT(DISTINCT review.opportunity_id)
          FROM intake_reviews AS review
          JOIN opportunities AS opportunity
            ON opportunity.workspace_id = review.workspace_id AND opportunity.id = review.opportunity_id
          WHERE review.workspace_id = ${context.workspace_id}::uuid
            AND review.type = 'IDENTITY_CONFLICT'
            AND review.resolution IS NULL
            AND review.identity_conflict_resolution IS NULL
            AND opportunity.merged_into_opportunity_id IS NULL
            ${scope}
        ) AS identity_conflict,
        (
          SELECT COUNT(DISTINCT review.opportunity_id)
          FROM intake_reviews AS review
          JOIN opportunities AS opportunity
            ON opportunity.workspace_id = review.workspace_id AND opportunity.id = review.opportunity_id
          WHERE review.workspace_id = ${context.workspace_id}::uuid
            AND review.type = 'POSSIBLE_DUPLICATE'
            AND review.resolution IS NULL
            AND opportunity.merged_into_opportunity_id IS NULL
            ${scope}
        ) AS possible_duplicate
    `)
  );

  const row = rows[0];
  return {
    MISSING_PHONE: Number(row?.missing_phone ?? 0n),
    IDENTITY_CONFLICT: Number(row?.identity_conflict ?? 0n),
    POSSIBLE_DUPLICATE: Number(row?.possible_duplicate ?? 0n)
  };
}

// ---------------------------------------------------------------------------
// countNewLeads — feeds "N novos leads — atualizar"
// ---------------------------------------------------------------------------

/**
 * The small periodic count ADR-0013 describes: it never moves the list on
 * its own. The screen polls this, shows "N novos leads — atualizar", and a
 * click calls `router.refresh()` — the list only ever moves when the gestor
 * asks it to (ADR-0006 regra 8, ADR-0013).
 */
export async function countNewLeads(
  context: UserContext,
  since: LeadListCursor,
  prisma: PrismaClient = sharedPrisma
): Promise<number> {
  assertUuid(since.id, "since.id");
  if (Number.isNaN(since.arrived_at.getTime())) {
    throw new Error("since.arrived_at must be a valid instant");
  }
  const scope = opportunityScopeSql(context, "opportunity");

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<Array<{ new_count: bigint }>>(Prisma.sql`
      SELECT COUNT(*) AS new_count
      FROM opportunities AS opportunity
      WHERE opportunity.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.merged_into_opportunity_id IS NULL
        AND (opportunity.arrived_at, opportunity.id) > (${since.arrived_at}::timestamptz, ${since.id}::uuid)
        ${scope}
    `)
  );
  return Number(rows[0]?.new_count ?? 0n);
}

// ---------------------------------------------------------------------------
// getLead
// ---------------------------------------------------------------------------

export interface LeadCandidatePerson {
  readonly person_id: string;
  readonly name: string | null;
  readonly cpf: string | null;
  readonly phones: readonly string[];
  readonly emails: readonly string[];
}

export interface LeadRelatedOpportunitySummary {
  readonly opportunity_id: string;
  readonly financing_type: FinancingType | null;
  readonly financial_institution: string | null;
  readonly installment_amount: string | null;
  readonly campaign_id: string | null;
  readonly campaign_name: string | null;
  readonly form_id: string | null;
  readonly form_name: string | null;
  readonly source: LeadSource | null;
  readonly arrived_at: Date;
  readonly assigned_user_id: string | null;
}

export interface LeadReviewDetail {
  readonly id: string;
  readonly type: "IDENTITY_CONFLICT" | "POSSIBLE_DUPLICATE";
  /** Populated only for IDENTITY_CONFLICT. */
  readonly candidate_persons: readonly LeadCandidatePerson[];
  /** Populated only for POSSIBLE_DUPLICATE — the other Opportunity and its owner. */
  readonly related_opportunity: LeadRelatedOpportunitySummary | null;
}

export interface LeadDetail {
  readonly opportunity_id: string;
  readonly person_id: string;
  readonly name: string | null;
  readonly cpf: string | null;
  readonly phones: readonly string[];
  readonly emails: readonly string[];
  readonly financing_type: FinancingType | null;
  readonly financial_institution: string | null;
  readonly installment_amount: string | null;
  readonly campaign_id: string | null;
  readonly campaign_name: string | null;
  readonly form_id: string | null;
  readonly form_name: string | null;
  readonly arrived_at: Date;
  readonly missing_phone: boolean;
  readonly assigned_user_id: string | null;
  readonly source: LeadSource | null;
  readonly reviews: readonly LeadReviewDetail[];
}

interface LeadCoreRawRow {
  readonly opportunity_id: string;
  readonly person_id: string;
  readonly name: string | null;
  readonly cpf: string | null;
  readonly phones: string[] | null;
  readonly emails: string[] | null;
  readonly financing_type: string | null;
  readonly financial_institution: string | null;
  readonly installment_amount: string | null;
  readonly campaign_id: string | null;
  readonly campaign_name: string | null;
  readonly form_id: string | null;
  readonly form_name: string | null;
  readonly arrived_at: Date;
  readonly missing_phone: boolean;
  readonly assigned_user_id: string | null;
  readonly source: string | null;
}

interface ReviewCoreRow {
  readonly id: string;
  readonly type: "IDENTITY_CONFLICT" | "POSSIBLE_DUPLICATE";
  readonly candidate_person_ids: string[];
  readonly related_opportunity_id: string | null;
}

interface CandidatePersonRawRow {
  readonly person_id: string;
  readonly name: string | null;
  readonly cpf: string | null;
  readonly phones: string[] | null;
  readonly emails: string[] | null;
}

interface RelatedOpportunityRawRow {
  readonly opportunity_id: string;
  readonly financing_type: string | null;
  readonly financial_institution: string | null;
  readonly installment_amount: string | null;
  readonly campaign_id: string | null;
  readonly campaign_name: string | null;
  readonly form_id: string | null;
  readonly form_name: string | null;
  readonly source: string | null;
  readonly arrived_at: Date;
  readonly assigned_user_id: string | null;
}

/**
 * The card: the lead, its unresolved reviews, and — for a possible duplicate
 * — the other Opportunity and its owner, and — for an identity conflict —
 * the candidate Pessoas, so the gestor has the side-by-side comparison
 * without a second screen.
 */
export async function getLead(
  context: UserContext,
  opportunity_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<LeadDetail> {
  assertUuid(opportunity_id, "opportunity_id");

  return withAccessContext(prisma, context, async (transaction) => {
    const coreRows = await transaction.$queryRaw<LeadCoreRawRow[]>(Prisma.sql`
      SELECT
        opportunity.id AS opportunity_id,
        opportunity.person_id,
        person.name,
        person.cpf,
        COALESCE(phones.values, ARRAY[]::text[]) AS phones,
        COALESCE(emails.values, ARRAY[]::text[]) AS emails,
        opportunity.financing_type::text AS financing_type,
        opportunity.financial_institution,
        opportunity.installment_amount::text AS installment_amount,
        opportunity.campaign_id,
        opportunity.campaign_name,
        opportunity.form_id,
        opportunity.form_name,
        opportunity.arrived_at,
        opportunity.missing_phone,
        opportunity.assigned_user_id,
        origin.source::text AS source
      FROM opportunities AS opportunity
      JOIN persons AS person
        ON person.workspace_id = opportunity.workspace_id AND person.id = opportunity.person_id
      LEFT JOIN LATERAL (
        SELECT array_agg(phone_e164 ORDER BY created_at) AS values
        FROM person_phones
        WHERE workspace_id = opportunity.workspace_id AND person_id = opportunity.person_id
      ) AS phones ON true
      LEFT JOIN LATERAL (
        SELECT array_agg(email ORDER BY created_at) AS values
        FROM person_emails
        WHERE workspace_id = opportunity.workspace_id AND person_id = opportunity.person_id
      ) AS emails ON true
      LEFT JOIN LATERAL (
        SELECT source
        FROM lead_submissions
        WHERE workspace_id = opportunity.workspace_id AND opportunity_id = opportunity.id
        ORDER BY received_at ASC, id ASC
        LIMIT 1
      ) AS origin ON true
      WHERE opportunity.id = ${opportunity_id}::uuid
        AND opportunity.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.merged_into_opportunity_id IS NULL
        ${opportunityScopeSql(context, "opportunity")}
    `);
    const core = coreRows[0];
    if (!core) {
      throw new Error("Lead not found in this workspace");
    }

    const reviewRows = await transaction.$queryRaw<ReviewCoreRow[]>`
      SELECT id, type::text AS type, candidate_person_ids, related_opportunity_id
      FROM intake_reviews
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND opportunity_id = ${opportunity_id}::uuid
        AND resolution IS NULL
        AND identity_conflict_resolution IS NULL
      ORDER BY created_at
    `;

    const candidate_person_ids = [
      ...new Set(reviewRows.flatMap((review) => review.candidate_person_ids))
    ];
    const candidatesByPersonId = new Map<string, LeadCandidatePerson>();
    if (candidate_person_ids.length > 0) {
      const candidateRows = await transaction.$queryRaw<CandidatePersonRawRow[]>(Prisma.sql`
        SELECT
          person.id AS person_id,
          person.name,
          person.cpf,
          COALESCE(phones.values, ARRAY[]::text[]) AS phones,
          COALESCE(emails.values, ARRAY[]::text[]) AS emails
        FROM persons AS person
        LEFT JOIN LATERAL (
          SELECT array_agg(phone_e164 ORDER BY created_at) AS values
          FROM person_phones
          WHERE workspace_id = person.workspace_id AND person_id = person.id
        ) AS phones ON true
        LEFT JOIN LATERAL (
          SELECT array_agg(email ORDER BY created_at) AS values
          FROM person_emails
          WHERE workspace_id = person.workspace_id AND person_id = person.id
        ) AS emails ON true
        WHERE person.workspace_id = ${context.workspace_id}::uuid
          AND person.id = ANY(${candidate_person_ids}::uuid[])
        ORDER BY person.id
      `);
      for (const row of candidateRows) {
        candidatesByPersonId.set(row.person_id, {
          person_id: row.person_id,
          name: row.name,
          cpf: row.cpf,
          phones: row.phones ?? [],
          emails: row.emails ?? []
        });
      }
    }

    const related_opportunity_ids = [
      ...new Set(
        reviewRows
          .map((review) => review.related_opportunity_id)
          .filter((id): id is string => id !== null)
      )
    ];
    const relatedByOpportunityId = new Map<string, LeadRelatedOpportunitySummary>();
    if (related_opportunity_ids.length > 0) {
      const relatedRows = await transaction.$queryRaw<RelatedOpportunityRawRow[]>(Prisma.sql`
        SELECT
          opportunity.id AS opportunity_id,
          opportunity.financing_type::text AS financing_type,
          opportunity.financial_institution,
          opportunity.installment_amount::text AS installment_amount,
          opportunity.campaign_id,
          opportunity.campaign_name,
          opportunity.form_id,
          opportunity.form_name,
          origin.source::text AS source,
          opportunity.arrived_at,
          opportunity.assigned_user_id
        FROM opportunities AS opportunity
        LEFT JOIN LATERAL (
          SELECT source
          FROM lead_submissions
          WHERE workspace_id = opportunity.workspace_id AND opportunity_id = opportunity.id
          ORDER BY received_at ASC, id ASC
          LIMIT 1
        ) AS origin ON true
        WHERE opportunity.workspace_id = ${context.workspace_id}::uuid
          AND opportunity.id = ANY(${related_opportunity_ids}::uuid[])
      `);
      for (const row of relatedRows) {
        relatedByOpportunityId.set(row.opportunity_id, {
          opportunity_id: row.opportunity_id,
          financing_type: (row.financing_type as FinancingType | null) ?? null,
          financial_institution: row.financial_institution,
          installment_amount: row.installment_amount,
          campaign_id: row.campaign_id,
          campaign_name: row.campaign_name,
          form_id: row.form_id,
          form_name: row.form_name,
          source: (row.source as LeadSource | null) ?? null,
          arrived_at: row.arrived_at,
          assigned_user_id: row.assigned_user_id
        });
      }
    }

    const reviews: LeadReviewDetail[] = reviewRows.map((review) => ({
      id: review.id,
      type: review.type,
      candidate_persons: review.candidate_person_ids
        .map((person_id) => candidatesByPersonId.get(person_id))
        .filter((candidate): candidate is LeadCandidatePerson => candidate !== undefined),
      related_opportunity:
        review.related_opportunity_id !== null
          ? (relatedByOpportunityId.get(review.related_opportunity_id) ?? null)
          : null
    }));

    return {
      opportunity_id: core.opportunity_id,
      person_id: core.person_id,
      name: core.name,
      cpf: core.cpf,
      phones: core.phones ?? [],
      emails: core.emails ?? [],
      financing_type: (core.financing_type as FinancingType | null) ?? null,
      financial_institution: core.financial_institution,
      installment_amount: core.installment_amount,
      campaign_id: core.campaign_id,
      campaign_name: core.campaign_name,
      form_id: core.form_id,
      form_name: core.form_name,
      arrived_at: core.arrived_at,
      missing_phone: core.missing_phone,
      assigned_user_id: core.assigned_user_id,
      source: (core.source as LeadSource | null) ?? null,
      reviews
    };
  });
}

// ---------------------------------------------------------------------------
// assignLead
// ---------------------------------------------------------------------------

export interface AssignLeadInput {
  readonly opportunity_id: string;
  readonly user_id: string;
}

export interface AssignedLead {
  readonly opportunity_id: string;
  readonly assigned_user_id: string;
}

/**
 * The condition arbitrates, never a prior read (ADR-0013): the `WHERE
 * assigned_user_id IS NULL` is what makes two gestores clicking the same
 * lead at once produce one winner and a clean failure for the other, instead
 * of the last write winning silently. UI wiring for this is Fase 2 (ADR-0015
 * "Atribuir · reatribuir"); it is built now because ADR-0016 lists it among
 * the operations this slice's accounting requires to exist.
 */
export async function assignLead(
  context: UserContext,
  input: AssignLeadInput,
  prisma: PrismaClient = sharedPrisma
): Promise<AssignedLead> {
  assertUuid(input.opportunity_id, "opportunity_id");
  assertUuid(input.user_id, "user_id");
  if (context.role === "ATTENDANT" || context.role === "SUPERVISOR") {
    throw new Error(`${context.role} cannot assign leads from the unassigned queue`);
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const claimed = await transaction.$executeRaw`
      UPDATE opportunities
      SET assigned_user_id = ${input.user_id}::uuid,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.opportunity_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
        AND assigned_user_id IS NULL
        AND merged_into_opportunity_id IS NULL
    `;
    if (claimed === 0) {
      throw new Error("The lead is already assigned, merged, or not visible in this workspace");
    }
    return { opportunity_id: input.opportunity_id, assigned_user_id: input.user_id };
  });
}

// ---------------------------------------------------------------------------
// updateLeadDetails — edit from the card and from the row
// ---------------------------------------------------------------------------

export interface UpdateLeadDetailsInput {
  readonly opportunity_id: string;
  /** `undefined` leaves the name untouched; `null`/`""` clears it. */
  readonly name?: string | null;
  /** A phone to add to the Pessoa. Contacts accumulate, never overwrite (ADR-0007). */
  readonly add_phone?: string;
  /** An e-mail to add to the Pessoa. Same accumulation rule. */
  readonly add_email?: string;
  readonly cpf?: string | null;
  readonly financing_type?: FinancingType | null;
  readonly financial_institution?: string | null;
  readonly installment_amount?: string | null;
}

export interface UpdateLeadDetailsResult {
  readonly opportunity_id: string;
  readonly missing_phone: boolean;
  /** Fields the caller sent that failed normalization and were dropped. */
  readonly rejected_fields: readonly string[];
}

interface CurrentLeadRow {
  readonly person_id: string;
  readonly assigned_user_id: string | null;
  readonly name: string | null;
  readonly cpf: string | null;
  readonly financing_type: string | null;
  readonly financial_institution: string | null;
  readonly installment_amount: string | null;
}

/**
 * Edits from the card and from the row are the same operation (the ticket
 * asks for both surfaces, never two paths). Every value that can be typed
 * wrong — phone, e-mail, CPF, the parcela — goes through the same pure
 * normalization ingestion uses, imported from `@marctco/domain`, never
 * re-implemented here.
 */
export async function updateLeadDetails(
  context: UserContext,
  input: UpdateLeadDetailsInput,
  prisma: PrismaClient = sharedPrisma
): Promise<UpdateLeadDetailsResult> {
  assertUuid(input.opportunity_id, "opportunity_id");

  return withAccessContext(prisma, context, async (transaction) => {
    const currentRows = await transaction.$queryRaw<CurrentLeadRow[]>`
      SELECT
        opportunity.person_id,
        opportunity.assigned_user_id,
        person.name,
        person.cpf,
        opportunity.financing_type::text AS financing_type,
        opportunity.financial_institution,
        opportunity.installment_amount::text AS installment_amount
      FROM opportunities AS opportunity
      JOIN persons AS person
        ON person.workspace_id = opportunity.workspace_id AND person.id = opportunity.person_id
      WHERE opportunity.id = ${input.opportunity_id}::uuid
        AND opportunity.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.merged_into_opportunity_id IS NULL
        ${opportunityScopeSql(context, "opportunity")}
      FOR UPDATE OF opportunity
    `;
    const current = currentRows[0];
    if (!current) {
      if (context.role === "ATTENDANT") {
        throw new Error("ATTENDANT can only edit a lead assigned to them");
      }
      throw new Error(`${context.role} cannot edit a lead outside their scope`);
    }

    const rejected_fields: string[] = [];

    const name = input.name === undefined ? current.name : emptyToNull(input.name);

    let cpf = current.cpf;
    if (input.cpf !== undefined) {
      if (input.cpf === null) {
        cpf = null;
      } else {
        const normalized = normalizeCpf(input.cpf);
        if (normalized === null) {
          rejected_fields.push("cpf");
        } else {
          cpf = normalized;
        }
      }
    }

    const financing_type =
      input.financing_type === undefined ? current.financing_type : input.financing_type;
    const financial_institution =
      input.financial_institution === undefined
        ? current.financial_institution
        : emptyToNull(input.financial_institution);

    let installment_amount = current.installment_amount;
    if (input.installment_amount !== undefined) {
      if (input.installment_amount === null) {
        installment_amount = null;
      } else {
        const normalized = normalizeDecimalAmount(input.installment_amount);
        if (normalized === null) {
          rejected_fields.push("installment_amount");
        } else {
          installment_amount = normalized;
        }
      }
    }

    await transaction.$executeRaw`
      UPDATE opportunities
      SET financing_type = ${financing_type}::financing_type,
          financial_institution = ${financial_institution},
          installment_amount = ${installment_amount}::numeric,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.opportunity_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
    `;
    await transaction.$executeRaw`
      UPDATE persons
      SET name = ${name},
          cpf = ${cpf},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${current.person_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
    `;

    if (input.add_phone !== undefined && input.add_phone !== "") {
      const reading = readPhone(input.add_phone);
      if (reading.kind !== "E164") {
        rejected_fields.push("phone");
      } else {
        await transaction.$executeRaw`
          INSERT INTO person_phones (workspace_id, person_id, phone_e164)
          VALUES (${context.workspace_id}::uuid, ${current.person_id}::uuid, ${reading.value})
          ON CONFLICT (person_id, phone_e164) DO NOTHING
        `;
      }
    }
    if (input.add_email !== undefined && input.add_email !== "") {
      const email = normalizeEmail(input.add_email);
      if (email === null) {
        rejected_fields.push("email");
      } else {
        await transaction.$executeRaw`
          INSERT INTO person_emails (workspace_id, person_id, email)
          VALUES (${context.workspace_id}::uuid, ${current.person_id}::uuid, ${email})
          ON CONFLICT (person_id, email) DO NOTHING
        `;
      }
    }

    // `missing_phone` means one thing only: no way to WhatsApp or call
    // (ADR-0007 §Quarentena). An edit that adds the first phone number is the
    // one thing on this screen that can turn that marker off.
    const phoneCountRows = await transaction.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM person_phones
      WHERE workspace_id = ${context.workspace_id}::uuid AND person_id = ${current.person_id}::uuid
    `;
    const missing_phone = (phoneCountRows[0]?.count ?? 0n) === 0n;
    await transaction.$executeRaw`
      UPDATE opportunities
      SET missing_phone = ${missing_phone}, updated_at = CURRENT_TIMESTAMP
      WHERE id = ${input.opportunity_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
    `;

    return { opportunity_id: input.opportunity_id, missing_phone, rejected_fields };
  });
}

function emptyToNull(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

// ---------------------------------------------------------------------------
// resolveIdentityConflict — "a resolução acontece aqui", identity half
// ---------------------------------------------------------------------------

export type IdentityConflictResolution = "MERGED" | "CONFIRMED_DISTINCT";

export interface ResolveIdentityConflictInput {
  readonly review_id: string;
  readonly resolution: IdentityConflictResolution;
  readonly reason: string;
  readonly resolved_at: Date;
  /** Required, and only meaningful, when `resolution` is `MERGED`. */
  readonly canonical_person_id?: string;
}

export interface ResolvedIdentityConflict {
  readonly review_id: string;
  readonly resolution: IdentityConflictResolution;
}

interface PendingIdentityConflictRow {
  readonly id: string;
  readonly opportunity_id: string;
  readonly candidate_person_ids: string[];
}

/**
 * The identity half of "a resolução acontece aqui, não em Integrações":
 * merge the Pessoa the lead was born on into a candidate, or confirm they
 * are genuinely distinct people. The UI never offers deleting either side —
 * only these two auditable outcomes (ADR-0007 §Identidade).
 *
 * The merge and the review's own resolution audit row commit in the **same**
 * transaction via `mergePersonsInTransaction`, so there is no window where
 * the Pessoas are merged but the review that asked for it still reads
 * pending, or the reverse.
 */
export async function resolveIdentityConflict(
  context: UserContext,
  input: ResolveIdentityConflictInput,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedIdentityConflict> {
  assertUuid(input.review_id, "review_id");
  if (context.role === "ATTENDANT") {
    throw new Error("ATTENDANT cannot resolve an identity conflict");
  }
  if (!(input.resolved_at instanceof Date) || Number.isNaN(input.resolved_at.getTime())) {
    throw new Error("resolved_at must be a valid Date");
  }
  if (input.reason.trim() === "") {
    throw new Error("A resolution reason is required");
  }
  if (input.resolution === "MERGED") {
    if (!input.canonical_person_id) {
      throw new Error("canonical_person_id is required to merge");
    }
    assertUuid(input.canonical_person_id, "canonical_person_id");
  }

  return withAccessContext(prisma, context, async (transaction) => {
    // Loaded regardless of resolution state, on purpose: the final UPDATE's
    // `WHERE ... IS NULL` below is what arbitrates "already resolved" against
    // a concurrent or a sequential retry (ADR-0013), the same shape
    // `resolveIntakeReview` uses. Filtering it out here too would collapse
    // "not found" and "already resolved" into one message.
    const rows = await transaction.$queryRaw<PendingIdentityConflictRow[]>`
      SELECT review.id, review.opportunity_id, review.candidate_person_ids
      FROM intake_reviews AS review
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = review.workspace_id
       AND opportunity.id = review.opportunity_id
      WHERE review.id = ${input.review_id}::uuid
        AND review.workspace_id = ${context.workspace_id}::uuid
        AND review.type = 'IDENTITY_CONFLICT'
        ${opportunityScopeSql(context, "opportunity")}
      FOR UPDATE OF review, opportunity
    `;
    const review = rows[0];
    if (!review) {
      throw new Error("The identity-conflict review was not found in this workspace");
    }
    if (
      input.resolution === "MERGED"
      && !review.candidate_person_ids.includes(input.canonical_person_id as string)
    ) {
      throw new Error("canonical_person_id must be one of the review's candidate Pessoas");
    }

    // Claimed before the merge runs, mirroring `resolveIntakeReview`: the
    // condition on both resolution columns being NULL is what arbitrates a
    // concurrent or a sequential double-resolve, and it must fire before any
    // side effect so a second caller never re-merges an already-resolved pair.
    const claimed = await transaction.$executeRaw`
      UPDATE intake_reviews
      SET identity_conflict_resolution = ${input.resolution}::identity_conflict_resolution,
          resolved_by_user_id = ${context.user_id}::uuid,
          resolved_at = ${input.resolved_at}::timestamptz,
          resolution_reason = ${input.reason}
      WHERE id = ${input.review_id}::uuid
        AND workspace_id = ${context.workspace_id}::uuid
        AND resolution IS NULL
        AND identity_conflict_resolution IS NULL
    `;
    if (claimed === 0) {
      throw new Error("The identity-conflict review was already resolved");
    }

    if (input.resolution === "MERGED") {
      const canonical_person_id = input.canonical_person_id as string;
      const opportunityRows = await transaction.$queryRaw<Array<{ person_id: string }>>`
        SELECT person_id FROM opportunities
        WHERE id = ${review.opportunity_id}::uuid AND workspace_id = ${context.workspace_id}::uuid
        FOR UPDATE
      `;
      const opportunity = opportunityRows[0];
      if (!opportunity) {
        throw new Error("The Opportunity carrying this review was not found");
      }
      await mergePersonsInTransaction(transaction, context.workspace_id, {
        absorbed_person_id: opportunity.person_id,
        canonical_person_id
      });
    }

    return { review_id: input.review_id, resolution: input.resolution };
  });
}

// Re-exported so `apps/web` never needs a second declaration of the shape a
// scoped transaction takes when a future operation is added here.
export type { ScopedTransactionClient };
