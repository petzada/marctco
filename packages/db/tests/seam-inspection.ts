import { PrismaClient } from "@prisma/client";

/**
 * What a seam test is allowed to look at, and the reason it lives here.
 *
 * `packages/db` does not hand out the Prisma client (ADR-0016), and the boundary
 * is enforced by path: nothing outside this package may import it. That rule is
 * about **production** code — a named operation is where `SET LOCAL` and the
 * role scope live, and code that bypasses it bypasses those. A seam test that
 * inspects what the path under test actually wrote is not production code, and
 * `packages/db/tests/rls.test.ts` has always read the schema this way.
 *
 * So the client stays inside the package, and the cross-cutting seam tests at
 * the repository root import these named readers instead. Readers never make
 * the path under test happen. Seam 4 also needs fixtures that have no
 * customer write: commercial feature flags, a template body the named
 * settings write refuses, and advancing a publication lease so the real
 * dispatcher pass can recover without waiting two wall-clock minutes.
 * Those live at the bottom of this file, separate from the post-condition
 * readers. Everything under test still goes through the real handler, the
 * real queue and the real worker.
 *
 * When the leads screen arrives (ticket 12) it brings a scoped `listLeads` for
 * the application, which is a different thing from this: that one answers "what
 * may this user see", and this one answers "what is in the database".
 */

let client: PrismaClient | null = null;

/**
 * A connection that bypasses RLS, so a test can prove a card did **not** land
 * in a workspace it should never have reached. Under the app role that question
 * is unanswerable: the row would be invisible either way.
 */
function inspector(): PrismaClient {
  if (client === null) {
    const database_url = process.env.SEAM2_ADMIN_DATABASE_URL;
    if (!database_url) {
      throw new Error("Seam inspection needs SEAM2_ADMIN_DATABASE_URL");
    }
    client = new PrismaClient({ datasources: { db: { url: database_url } } });
  }
  return client;
}

export async function closeSeamInspection(): Promise<void> {
  await client?.$disconnect();
  client = null;
}

export interface InspectedReview {
  readonly type: "IDENTITY_CONFLICT" | "POSSIBLE_DUPLICATE";
  readonly candidate_person_ids: readonly string[];
  readonly related_opportunity_id: string | null;
}

export interface InspectedCard {
  readonly id: string;
  readonly person_id: string;
  readonly pipeline_id: string;
  readonly stage_id: string;
  readonly area: string;
  readonly status: string;
  readonly arrived_at: Date;
  readonly assigned_user_id: string | null;
  readonly missing_phone: boolean;
  readonly campaign_id: string | null;
  readonly campaign_name: string | null;
  readonly form_id: string | null;
  readonly form_name: string | null;
  readonly merged_into_opportunity_id: string | null;
  readonly first_contact_at: Date | null;
  readonly reviews: readonly InspectedReview[];
  readonly person: {
    readonly name: string | null;
    readonly cpf: string | null;
    readonly phones: readonly string[];
    readonly emails: readonly string[];
  };
}

/** Every card in a workspace, oldest arrival first, with what hangs off it. */
export async function inspectCards(workspace_id: string): Promise<InspectedCard[]> {
  const rows = await inspector().opportunity.findMany({
    where: { workspace_id },
    include: {
      reviews: { orderBy: { type: "asc" } },
      related_reviews: { orderBy: { type: "asc" } },
      person: { include: { phones: true, emails: true } }
    },
    orderBy: [{ arrived_at: "asc" }, { created_at: "asc" }]
  });

  return rows.map((row) => ({
    id: row.id,
    person_id: row.person_id,
    pipeline_id: row.pipeline_id,
    stage_id: row.stage_id,
    area: row.area,
    status: row.status,
    arrived_at: row.arrived_at,
    assigned_user_id: row.assigned_user_id,
    missing_phone: row.missing_phone,
    campaign_id: row.campaign_id,
    campaign_name: row.campaign_name,
    form_id: row.form_id,
    form_name: row.form_name,
    merged_into_opportunity_id: row.merged_into_opportunity_id,
    first_contact_at: row.first_contact_at,
    reviews: [...row.reviews, ...row.related_reviews].map((review) => ({
      type: review.type,
      candidate_person_ids: review.candidate_person_ids,
      related_opportunity_id: review.related_opportunity_id
    })),
    person: {
      name: row.person.name,
      cpf: row.person.cpf,
      phones: row.person.phones.map((phone) => phone.phone_e164),
      emails: row.person.emails.map((email) => email.email)
    }
  }));
}

export interface InspectedSubmission {
  readonly id: string;
  readonly source: string;
  readonly external_lead_id: string;
  readonly received_at: Date;
  readonly last_integration_event_id: string;
  readonly transmission_count: number;
  readonly opportunity_id: string | null;
}

export async function inspectSubmissions(
  workspace_id: string,
  external_lead_id?: string
): Promise<InspectedSubmission[]> {
  return inspector().leadSubmission.findMany({
    where: {
      workspace_id,
      ...(external_lead_id === undefined ? {} : { external_lead_id })
    },
    orderBy: { received_at: "asc" }
  });
}

export interface InspectedTimelineEvent {
  readonly type: "RETRANSMISSION_RECEIVED" | "SUBMISSION_REENTERED";
  readonly opportunity_id: string;
  readonly lead_submission_id: string;
  readonly integration_event_id: string;
  readonly occurred_at: Date;
}

/** Immutable ingestion facts attached to an Opportunity, oldest first. */
export async function inspectTimeline(
  workspace_id: string,
  opportunity_id: string
): Promise<InspectedTimelineEvent[]> {
  const rows = await inspector().opportunityTimelineEvent.findMany({
    where: {
      workspace_id,
      opportunity_id,
      type: { in: ["RETRANSMISSION_RECEIVED", "SUBMISSION_REENTERED"] }
    },
    select: {
      type: true,
      opportunity_id: true,
      lead_submission_id: true,
      integration_event_id: true,
      occurred_at: true
    },
    orderBy: [{ occurred_at: "asc" }, { id: "asc" }]
  });
  return rows.map((row) => {
    if (
      (row.type !== "RETRANSMISSION_RECEIVED" && row.type !== "SUBMISSION_REENTERED") ||
      row.lead_submission_id === null ||
      row.integration_event_id === null
    ) {
      throw new Error("ingestion timeline facts must keep submission and integration event ids");
    }
    return {
      type: row.type,
      opportunity_id: row.opportunity_id,
      lead_submission_id: row.lead_submission_id,
      integration_event_id: row.integration_event_id,
      occurred_at: row.occurred_at
    };
  });
}

/** The ENTRY stage of the workspace's default commercial pipeline. */
export async function inspectDefaultEntryStage(
  workspace_id: string
): Promise<{ pipeline_id: string; stage_id: string }> {
  const pipeline = await inspector().pipeline.findFirstOrThrow({
    where: { workspace_id, type: "COMMERCIAL", is_default: true },
    include: { stages: { where: { role: "ENTRY" } } }
  });
  const stage = pipeline.stages[0];
  if (!stage) {
    throw new Error("the default commercial pipeline has no ENTRY stage");
  }
  return { pipeline_id: pipeline.id, stage_id: stage.id };
}

export type InspectedMessageFactType = "WHATSAPP_OUTBOUND_SENT" | "WHATSAPP_OUTBOUND_FAILED";

export interface InspectedMessageFact {
  readonly type: InspectedMessageFactType;
  readonly opportunity_id: string;
  readonly occurred_at: Date;
}

/**
 * Message facts on a card, oldest first. Preview, phone and external ids stay
 * out: Seam 4 asserts that a fact of the right type landed, not the body.
 */
export async function inspectMessageFacts(
  workspace_id: string,
  opportunity_id: string
): Promise<InspectedMessageFact[]> {
  const rows = await inspector().opportunityTimelineEvent.findMany({
    where: {
      workspace_id,
      opportunity_id,
      type: { in: ["WHATSAPP_OUTBOUND_SENT", "WHATSAPP_OUTBOUND_FAILED"] }
    },
    select: {
      type: true,
      opportunity_id: true,
      occurred_at: true
    },
    orderBy: [{ occurred_at: "asc" }, { id: "asc" }]
  });
  return rows.map((row) => {
    if (row.type !== "WHATSAPP_OUTBOUND_SENT" && row.type !== "WHATSAPP_OUTBOUND_FAILED") {
      throw new Error("message facts must be outbound sent or failed");
    }
    return {
      type: row.type,
      opportunity_id: row.opportunity_id,
      occurred_at: row.occurred_at
    };
  });
}

export interface InspectedOutboundAttempt {
  readonly id: string;
  readonly opportunity_id: string;
  readonly kind: string;
  readonly dispatch_status: string;
  readonly delivery_status: string;
  readonly failure_reason: string | null;
  readonly dispatched_at: Date | null;
  readonly sent_at: Date | null;
  readonly failed_at: Date | null;
}

/**
 * Outbox rows for a workspace. Statuses and timestamps only — no destination
 * phone, template body or provider payload (ADR-0019).
 */
export async function inspectOutboundAttempts(
  workspace_id: string,
  opportunity_id?: string
): Promise<InspectedOutboundAttempt[]> {
  return inspector().channelOutboundAttempt.findMany({
    where: {
      workspace_id,
      ...(opportunity_id === undefined ? {} : { opportunity_id })
    },
    select: {
      id: true,
      opportunity_id: true,
      kind: true,
      dispatch_status: true,
      delivery_status: true,
      failure_reason: true,
      dispatched_at: true,
      sent_at: true,
      failed_at: true
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }]
  });
}

export interface InspectedPendingDuplicateReview {
  readonly id: string;
  readonly opportunity_id: string;
  readonly related_opportunity_id: string | null;
}

/**
 * Unresolved possible-duplicate markers, ids only. Seam 4 uses this to drive
 * the real `resolveIntakeReview` named operation without reading phone or body.
 */
export async function inspectPendingDuplicateReviews(
  workspace_id: string
): Promise<InspectedPendingDuplicateReview[]> {
  const rows = await inspector().intakeReview.findMany({
    where: {
      workspace_id,
      type: "POSSIBLE_DUPLICATE",
      resolution: null
    },
    orderBy: [{ created_at: "asc" }, { id: "asc" }],
    select: {
      id: true,
      opportunity_id: true,
      related_opportunity_id: true
    }
  });
  return rows.map((row) => ({
    id: row.id,
    opportunity_id: row.opportunity_id,
    related_opportunity_id: row.related_opportunity_id
  }));
}

/**
 * Publication lease is two minutes (ticket 03b). Seam 4 advances it so the
 * next real dispatcher pass can recover a Redis-down publish without waiting
 * out the wall clock. Statuses only — no phone or body.
 */
export async function expireChannelDispatchLeases(workspace_id: string): Promise<void> {
  await inspector().channelOutboundAttempt.updateMany({
    where: { workspace_id, dispatch_status: "PENDING" },
    data: { dispatch_lease_until: new Date(0) }
  });
}

/**
 * marctco enables commercial flags; the customer has no named write. Seam 4
 * uses this so a provisioned workspace can exercise the assignment path.
 */
export async function seedWorkspaceFeatureFlag(
  workspace_id: string,
  key: "auto_primeiro_contato"
): Promise<void> {
  await inspector().workspaceFlag.upsert({
    where: { workspace_id_key: { workspace_id, key } },
    create: { workspace_id, key },
    update: {}
  });
}

/**
 * Persists a template the named settings write refuses, so Seam 4 can prove
 * the worker still fails closed without sendText.
 */
export async function seedRejectedFirstContactTemplate(
  workspace_id: string,
  template_body: string
): Promise<void> {
  await inspector().workspaceSettings.upsert({
    where: { workspace_id },
    create: {
      workspace_id,
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body: template_body
    },
    update: {
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body: template_body
    }
  });
}
