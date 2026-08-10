import { randomUUID } from "node:crypto";
import {
  buildInboundLead,
  decideIntake,
  normalize,
  readLeadPayload,
  type IntakePlan,
  type LeadSource,
  type PersonContacts,
  type SubmissionInsert
} from "@marctco/domain";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createJobContext,
  createUserContextFromResolvedMembership,
  type JobContext
} from "../src/access-context.js";
import {
  applyIntakePlan,
  findOpenOpportunitiesOfPerson,
  recordLeadSubmission,
  resolveIntakeDestination
} from "../src/intake.js";
import { listIntegrationEvents } from "../src/integration-event.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

/**
 * The seeder connects as the local superuser and bypasses RLS, so it can write
 * two workspaces at once. Everything under test runs through a connection whose
 * session role is `marctco_app`, where the policies apply as in production.
 */
function appRoleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c role=marctco_app");
  return parsed.toString();
}

const seeder = new PrismaClient({ datasources: { db: { url: database_url } } });
const app = new PrismaClient({ datasources: { db: { url: appRoleUrl(database_url) } } });

const workspace = randomUUID();
const neighbour_workspace = randomUUID();
const default_pipeline = randomUUID();
const default_entry_stage = randomUUID();
const default_closing_stage = randomUUID();
const targeted_pipeline = randomUUID();
const targeted_entry_stage = randomUUID();
const connection_id = randomUUID();
const neighbour_connection = randomUUID();
const known_person = randomUUID();
const neighbour_person = randomUUID();
const manager_user = randomUUID();

const RECEIVED_AT = new Date("2026-08-08T12:00:00.000Z");
const RELEASED_AT = new Date("2026-08-11T09:30:00.000Z");

const contacts: PersonContacts = {
  name: "Maria",
  phones: ["+5511987654321"],
  emails: ["maria@exemplo.com"],
  cpf: "52998224725"
};

let context: JobContext;
const manager_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});

/** A fresh event to hang a submission on: each transmission carries its own. */
async function seedEvent(workspace_id = workspace): Promise<string> {
  const id = randomUUID();
  await seeder.integrationEvent.create({
    data: {
      id,
      workspace_id,
      integration_connection_id:
        workspace_id === workspace ? connection_id : neighbour_connection,
      raw: { name: "Maria" },
      received_at: RECEIVED_AT
    }
  });
  return id;
}

interface Submitted {
  readonly job: JobContext;
  readonly event_id: string;
  readonly lead_submission_id: string;
  readonly outcome: SubmissionInsert;
}

async function submit(
  external_lead_id: string,
  options: {
    source?: LeadSource;
    received_at?: Date;
    workspace_id?: ReturnType<typeof randomUUID>;
  } = {}
): Promise<Submitted> {
  const workspace_id = options.workspace_id ?? workspace;
  const event_id = await seedEvent(workspace_id);
  const job = createJobContext({ workspace_id, integration_event_id: event_id });
  const outcome = await recordLeadSubmission(
    job,
    {
      key: { source: options.source ?? "META_LEAD_ADS", external_lead_id },
      integration_event_id: event_id,
      received_at: options.received_at ?? RECEIVED_AT
    },
    app
  );
  return { job, event_id, lead_submission_id: outcome.lead_submission_id, outcome };
}

type NewOpportunityPlan = Extract<IntakePlan, { kind: "NEW_OPPORTUNITY" }>;

function newOpportunityPlan(
  submitted: Submitted,
  overrides: Partial<NewOpportunityPlan> = {}
): NewOpportunityPlan {
  return {
    kind: "NEW_OPPORTUNITY",
    lead_submission_id: submitted.lead_submission_id,
    integration_event_id: submitted.event_id,
    person: { kind: "CREATE" },
    contacts,
    pipeline_id: default_pipeline,
    stage_id: default_entry_stage,
    arrived_at: RECEIVED_AT,
    missing_phone: false,
    financing_type: null,
    financial_institution: null,
    installment_amount: null,
    reviews: [],
    ...overrides
  };
}

/** Narrows what `applyIntakePlan` reported, failing the test rather than the type. */
async function applyNewOpportunity(
  submitted: Submitted,
  overrides: Partial<NewOpportunityPlan> = {}
): Promise<{ opportunity_id: string; person_id: string }> {
  const applied = await applyIntakePlan(
    submitted.job,
    newOpportunityPlan(submitted, overrides),
    app
  );
  if (applied.kind !== "NEW_OPPORTUNITY") {
    throw new Error(`expected an applied opportunity, got ${applied.kind}`);
  }
  return { opportunity_id: applied.opportunity_id, person_id: applied.person_id };
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Intake" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Intake vizinho" }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: default_pipeline,
        workspace_id: workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: default_entry_stage, label: "Novo lead", position: 1, role: "ENTRY" },
            { id: default_closing_stage, label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    // A second commercial pipeline, so "the default one" is a real choice
    // rather than the only row in the table.
    await transaction.pipeline.create({
      data: {
        id: targeted_pipeline,
        workspace_id: workspace,
        name: "Campanha",
        type: "COMMERCIAL",
        is_default: false,
        stages: {
          create: [
            { id: targeted_entry_stage, label: "Entrada", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.pipeline.create({
      data: {
        workspace_id: neighbour_workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.integrationConnection.createMany({
      data: [
        {
          id: connection_id,
          workspace_id: workspace,
          provider: "PLUGA",
          token_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          token_last4: "aaaa"
        },
        {
          id: neighbour_connection,
          workspace_id: neighbour_workspace,
          provider: "PLUGA",
          token_hash: randomUUID().replaceAll("-", "").padEnd(64, "1"),
          token_last4: "bbbb"
        }
      ]
    });
    await transaction.person.createMany({
      data: [
        { id: known_person, workspace_id: workspace, name: "Maria" },
        { id: neighbour_person, workspace_id: neighbour_workspace, name: "Vizinha" }
      ]
    });
  });

  context = createJobContext({
    workspace_id: workspace,
    integration_event_id: await seedEvent()
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("resolveIntakeDestination", () => {
  it("falls back to the default commercial pipeline's ENTRY stage", async () => {
    await expect(resolveIntakeDestination(context, null, app)).resolves.toEqual({
      pipeline_id: default_pipeline,
      entry_stage_id: default_entry_stage
    });
  });

  it("prefers the connection's target pipeline when it declares one", async () => {
    await expect(resolveIntakeDestination(context, targeted_pipeline, app)).resolves.toEqual({
      pipeline_id: targeted_pipeline,
      entry_stage_id: targeted_entry_stage
    });
  });

  it("refuses a target pipeline from another workspace instead of silently using the default", async () => {
    // Under RLS a neighbour's pipeline is simply not there. Falling back would
    // hide a misconfigured connection behind correct-looking behaviour.
    const neighbour_pipeline = await seeder.pipeline.findFirstOrThrow({
      where: { workspace_id: neighbour_workspace }
    });

    await expect(resolveIntakeDestination(context, neighbour_pipeline.id, app)).rejects.toThrow(
      /pipeline/i
    );
  });
});

describe("recordLeadSubmission: the constraint arbitrates, never a SELECT", () => {
  it("inserts a new submission and reports it as inserted", async () => {
    const submitted = await submit(`first-${randomUUID()}`);

    expect(submitted.outcome.kind).toBe("INSERTED");
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: submitted.lead_submission_id } })
    ).resolves.toMatchObject({
      source: "META_LEAD_ADS",
      last_integration_event_id: submitted.event_id,
      transmission_count: 1,
      opportunity_id: null,
      received_at: RECEIVED_AT
    });
  });

  it("reports the second transmission of the same key as a duplicate, without throwing", async () => {
    // Capturing the unique violation would abort the whole transaction in
    // Postgres, and every command a retransmission still owes would fail with
    // an error that does not even mention duplication (ADR-0007).
    const key = `twice-${randomUUID()}`;
    const first = await submit(key);
    const second = await submit(key, { received_at: RELEASED_AT });

    expect(second.outcome).toEqual({
      kind: "DUPLICATE",
      lead_submission_id: first.lead_submission_id,
      opportunity_id: null
    });
    // Nothing about the first row moved: pointing at the new transmission is
    // the plan's job, not the insert's.
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: first.lead_submission_id } })
    ).resolves.toMatchObject({
      last_integration_event_id: first.event_id,
      received_at: RECEIVED_AT,
      transmission_count: 1
    });
  });

  it("lets the same external id belong to two different sources", async () => {
    const shared = `shared-${randomUUID()}`;
    const meta = await submit(shared);
    const google = await submit(shared, { source: "GOOGLE_LEAD_FORM" });

    expect([meta.outcome.kind, google.outcome.kind]).toEqual(["INSERTED", "INSERTED"]);
  });

  it("keeps the conflict intra-tenant: the same key in another workspace is a new submission", async () => {
    const shared = `cross-${randomUUID()}`;
    const mine = await submit(shared);
    const theirs = await submit(shared, { workspace_id: neighbour_workspace });

    expect([mine.outcome.kind, theirs.outcome.kind]).toEqual(["INSERTED", "INSERTED"]);
    expect(mine.lead_submission_id).not.toBe(theirs.lead_submission_id);
  });

  it("produces one submission when two transmissions race", async () => {
    const key = `race-${randomUUID()}`;
    const settled = await Promise.allSettled([submit(key), submit(key)]);

    // Under a genuine race one of the two may find the conflicting row still
    // uncommitted and fail loudly, so the job is retried against a committed
    // row. What must never happen is two submissions.
    const outcomes = settled
      .filter((result) => result.status === "fulfilled")
      .map((result) => result.value.outcome.kind);
    expect(outcomes).toContain("INSERTED");
    await expect(
      seeder.leadSubmission.count({ where: { workspace_id: workspace, external_lead_id: key } })
    ).resolves.toBe(1);
  });
});

describe("applyIntakePlan: NEW_OPPORTUNITY", () => {
  it("creates the Pessoa, her contacts and an OPEN commercial card in the ENTRY stage", async () => {
    const submitted = await submit(`new-${randomUUID()}`);
    const applied = await applyNewOpportunity(submitted);

    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: applied.opportunity_id } })
    ).resolves.toMatchObject({
      workspace_id: workspace,
      person_id: applied.person_id,
      pipeline_id: default_pipeline,
      stage_id: default_entry_stage,
      area: "COMMERCIAL",
      status: "OPEN",
      arrived_at: RECEIVED_AT,
      assigned_user_id: null,
      missing_phone: false,
      financing_type: null,
      merged_into_opportunity_id: null
    });

    const person = await seeder.person.findUniqueOrThrow({
      where: { id: applied.person_id },
      include: { phones: true, emails: true }
    });
    expect(person.name).toBe("Maria");
    expect(person.cpf).toBe("52998224725");
    expect(person.phones.map((phone) => phone.phone_e164)).toEqual(["+5511987654321"]);
    expect(person.emails.map((email) => email.email)).toEqual(["maria@exemplo.com"]);

    // The submission now points at the card it produced, and the event is no
    // longer merely received.
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: submitted.lead_submission_id } })
    ).resolves.toMatchObject({
      opportunity_id: applied.opportunity_id,
      last_integration_event_id: submitted.event_id
    });
    await expect(
      seeder.integrationEvent.findUniqueOrThrow({ where: { id: submitted.event_id } })
    ).resolves.toMatchObject({ status: "PROCESSED" });
  });

  it("adds contacts to a reused Pessoa without overwriting or duplicating any", async () => {
    const existing = await seeder.personPhone.create({
      data: { workspace_id: workspace, person_id: known_person, phone_e164: "+551133334444" }
    });

    const submitted = await submit(`reuse-${randomUUID()}`);
    const applied = await applyNewOpportunity(submitted, {
      person: { kind: "REUSE", person_id: known_person },
      // The full set the submission carried, including the number the Pessoa
      // already had: receiving it again must change no row at all.
      contacts: {
        name: "Maria Silva",
        phones: ["+551133334444", "+5511999990000"],
        emails: [],
        cpf: null
      }
    });

    expect(applied.person_id).toBe(known_person);

    const phones = await seeder.personPhone.findMany({
      where: { person_id: known_person },
      orderBy: { phone_e164: "asc" }
    });
    expect(phones.map((phone) => phone.phone_e164)).toEqual([
      "+551133334444",
      "+5511999990000"
    ]);
    // Same row as before, not a replacement — and the earlier name survived.
    expect(phones[0]?.id).toBe(existing.id);
    await expect(
      seeder.person.findUniqueOrThrow({ where: { id: known_person } })
    ).resolves.toMatchObject({ name: "Maria" });
  });

  it("writes the marker for a lead that brought an e-mail and no phone", async () => {
    const submitted = await submit(`email-only-${randomUUID()}`, { source: "LANDING_PAGE" });
    const applied = await applyNewOpportunity(submitted, {
      contacts: { name: null, phones: [], emails: ["so-email@exemplo.com"], cpf: null },
      missing_phone: true
    });

    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: applied.opportunity_id } })
    ).resolves.toMatchObject({ missing_phone: true });
  });

  it("stores the financing data it was given, exactly", async () => {
    const submitted = await submit(`financed-${randomUUID()}`);
    const applied = await applyNewOpportunity(submitted, {
      financing_type: "REAL_ESTATE",
      financial_institution: "Banco X",
      installment_amount: "1234.56"
    });

    const opportunity = await seeder.opportunity.findUniqueOrThrow({
      where: { id: applied.opportunity_id }
    });
    expect(opportunity.financing_type).toBe("REAL_ESTATE");
    expect(opportunity.financial_institution).toBe("Banco X");
    expect(opportunity.installment_amount?.toString()).toBe("1234.56");
  });

  it("hangs the reviews the plan carries on the card it just created", async () => {
    const earlier = await applyNewOpportunity(await submit(`earlier-${randomUUID()}`));
    const submitted = await submit(`reviewed-${randomUUID()}`);

    const applied = await applyNewOpportunity(submitted, {
      reviews: [
        { type: "IDENTITY_CONFLICT", candidate_person_ids: [known_person] },
        { type: "POSSIBLE_DUPLICATE", related_opportunity_id: earlier.opportunity_id }
      ]
    });

    const reviews = await seeder.intakeReview.findMany({
      where: { opportunity_id: applied.opportunity_id },
      orderBy: { type: "asc" }
    });
    expect(reviews).toHaveLength(2);
    expect(reviews[0]).toMatchObject({
      type: "IDENTITY_CONFLICT",
      candidate_person_ids: [known_person],
      related_opportunity_id: null
    });
    expect(reviews[1]).toMatchObject({
      type: "POSSIBLE_DUPLICATE",
      candidate_person_ids: [],
      related_opportunity_id: earlier.opportunity_id
    });
  });

  it("refuses a review whose type does not carry its own evidence", async () => {
    // The union of the plan, restated where the row lands: a conflict with no
    // candidates is a review nobody can resolve, and a possible duplicate with
    // no other card is a warning pointing at nothing.
    const card = await seeder.opportunity.findFirstOrThrow({ where: { workspace_id: workspace } });

    await expect(
      seeder.intakeReview.create({
        data: { workspace_id: workspace, opportunity_id: card.id, type: "IDENTITY_CONFLICT" }
      })
    ).rejects.toThrow(/intake_reviews_type_carries_its_own_evidence/i);

    await expect(
      seeder.intakeReview.create({
        data: {
          workspace_id: workspace,
          opportunity_id: card.id,
          type: "POSSIBLE_DUPLICATE",
          candidate_person_ids: [known_person],
          related_opportunity_id: card.id
        }
      })
    ).rejects.toThrow(/intake_reviews/i);
  });

  it("writes nothing at all when any part of the plan fails", async () => {
    const submitted = await submit(`atomic-${randomUUID()}`);
    const persons_before = await seeder.person.count({ where: { workspace_id: workspace } });

    await expect(
      applyIntakePlan(
        submitted.job,
        // A stage that does not exist: the card cannot be written, and neither
        // may the Pessoa that would otherwise be left orphaned.
        newOpportunityPlan(submitted, { stage_id: randomUUID() }),
        app
      )
    ).rejects.toThrow();

    await expect(seeder.person.count({ where: { workspace_id: workspace } })).resolves.toBe(
      persons_before
    );
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: submitted.lead_submission_id } })
    ).resolves.toMatchObject({ opportunity_id: null });
    await expect(
      seeder.integrationEvent.findUniqueOrThrow({ where: { id: submitted.event_id } })
    ).resolves.toMatchObject({ status: "RECEIVED" });
  });

  it("gives one submission one card, even when two applications race for it", async () => {
    // The window this closes is the one the three-phase shape opens: the insert
    // commits in its own transaction, so a second worker on the same key
    // legitimately reads "duplicate with no card" and takes the same recovery
    // path. Only the condition on `opportunity_id IS NULL` decides which of
    // them wins; the loser rolls back whole and its retry goes inert.
    const submitted = await submit(`claim-${randomUUID()}`);
    const persons_before = await seeder.person.count({ where: { workspace_id: workspace } });

    const settled = await Promise.allSettled([
      applyIntakePlan(submitted.job, newOpportunityPlan(submitted), app),
      applyIntakePlan(submitted.job, newOpportunityPlan(submitted), app)
    ]);

    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const submission = await seeder.leadSubmission.findUniqueOrThrow({
      where: { id: submitted.lead_submission_id }
    });
    expect(submission.opportunity_id).not.toBeNull();
    // The loser wrote no card and, just as importantly, no orphan Pessoa.
    await expect(
      seeder.opportunity.count({ where: { workspace_id: workspace, id: submission.opportunity_id ?? "" } })
    ).resolves.toBe(1);
    await expect(seeder.person.count({ where: { workspace_id: workspace } })).resolves.toBe(
      persons_before + 1
    );
  });

  it("never creates a legal Opportunity — ingestion has no way to ask for one", async () => {
    const applied = await applyNewOpportunity(await submit(`commercial-${randomUUID()}`));
    const areas = await seeder.opportunity.findMany({
      where: { workspace_id: workspace },
      select: { area: true }
    });

    expect(areas.every((row) => row.area === "COMMERCIAL")).toBe(true);
    expect(applied.opportunity_id).toBeTruthy();
  });
});

describe("applyIntakePlan: RETRANSMISSION and QUARANTINE", () => {
  it("points the submission at the new transmission, counts it, and moves nothing else", async () => {
    const key = `inert-${randomUUID()}`;
    const first = await submit(key);
    const applied = await applyNewOpportunity(first);

    // The card advances and is lost, exactly as an operation would move it.
    await seeder.opportunity.update({
      where: { id: applied.opportunity_id },
      data: { stage_id: default_closing_stage, status: "LOST", assigned_user_id: randomUUID() }
    });
    const before = await seeder.opportunity.findUniqueOrThrow({
      where: { id: applied.opportunity_id }
    });

    const resent = await submit(key);
    expect(resent.outcome).toEqual({
      kind: "DUPLICATE",
      lead_submission_id: first.lead_submission_id,
      opportunity_id: applied.opportunity_id
    });

    await applyIntakePlan(
      resent.job,
      {
        kind: "RETRANSMISSION",
        lead_submission_id: first.lead_submission_id,
        opportunity_id: applied.opportunity_id,
        integration_event_id: resent.event_id
      },
      app
    );

    const after = await seeder.opportunity.findUniqueOrThrow({
      where: { id: applied.opportunity_id }
    });
    expect(after.stage_id).toBe(before.stage_id);
    expect(after.status).toBe("LOST");
    expect(after.assigned_user_id).toBe(before.assigned_user_id);
    expect(after.arrived_at).toEqual(before.arrived_at);

    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: first.lead_submission_id } })
    ).resolves.toMatchObject({
      last_integration_event_id: resent.event_id,
      transmission_count: 2,
      opportunity_id: applied.opportunity_id
    });
    await expect(
      seeder.opportunityTimelineEvent.findMany({
        where: { integration_event_id: resent.event_id }
      })
    ).resolves.toMatchObject([
      {
        workspace_id: workspace,
        opportunity_id: applied.opportunity_id,
        type: "RETRANSMISSION_RECEIVED",
        lead_submission_id: first.lead_submission_id,
        integration_event_id: resent.event_id,
        occurred_at: RECEIVED_AT
      }
    ]);
  });

  it("marks the event quarantined and creates no Pessoa and no card", async () => {
    const submitted = await submit(`quarantined-${randomUUID()}`);
    const persons_before = await seeder.person.count({ where: { workspace_id: workspace } });

    const applied = await applyIntakePlan(
      submitted.job,
      {
        kind: "QUARANTINE",
        lead_submission_id: submitted.lead_submission_id,
        integration_event_id: submitted.event_id
      },
      app
    );

    expect(applied.kind).toBe("QUARANTINE");
    await expect(seeder.person.count({ where: { workspace_id: workspace } })).resolves.toBe(
      persons_before
    );
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: submitted.lead_submission_id } })
    ).resolves.toMatchObject({ opportunity_id: null });
    await expect(
      seeder.integrationEvent.findUniqueOrThrow({ where: { id: submitted.event_id } })
    ).resolves.toMatchObject({ status: "QUARANTINED" });
  });

  it("keeps the quarantined payload visible through the integration-event reader", async () => {
    const submitted = await submit(`visible-quarantine-${randomUUID()}`);
    await applyIntakePlan(
      submitted.job,
      {
        kind: "QUARANTINE",
        lead_submission_id: submitted.lead_submission_id,
        integration_event_id: submitted.event_id
      },
      app
    );

    const events = await listIntegrationEvents(manager_context, { limit: 500 }, app);
    expect(events.find((event) => event.id === submitted.event_id)).toMatchObject({
      status: "QUARANTINED",
      raw: { name: "Maria" },
      processed_at: null
    });
  });

  it("reuses the intake operations and starts arrived_at at the release instant", async () => {
    const external_lead_id = `released-${randomUUID()}`;
    const submitted = await submit(external_lead_id);
    await applyIntakePlan(
      submitted.job,
      {
        kind: "QUARANTINE",
        lead_submission_id: submitted.lead_submission_id,
        integration_event_id: submitted.event_id
      },
      app
    );

    const release_submission = await recordLeadSubmission(
      manager_context,
      {
        key: { source: "META_LEAD_ADS", external_lead_id },
        integration_event_id: submitted.event_id,
        received_at: RECEIVED_AT
      },
      app
    );
    expect(release_submission).toEqual({
      kind: "DUPLICATE",
      lead_submission_id: submitted.lead_submission_id,
      opportunity_id: null
    });

    const normalized = normalize(
      buildInboundLead(readLeadPayload({ name: "Maria", phone: "11987654321" }), {
        source: "META_LEAD_ADS",
        external_lead_id
      })
    );
    const release_plan = decideIntake({
      normalized,
      submission: release_submission,
      person: { kind: "NEW_PERSON", contacts },
      destination: { pipeline_id: default_pipeline, entry_stage_id: default_entry_stage },
      open_opportunity_ids: [],
      integration_event_id: submitted.event_id,
      now: RELEASED_AT
    });
    const applied = await applyIntakePlan(manager_context, release_plan, app);
    expect(applied.kind).toBe("NEW_OPPORTUNITY");
    if (applied.kind !== "NEW_OPPORTUNITY") {
      throw new Error("expected quarantine release to create an Opportunity");
    }
    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: applied.opportunity_id } })
    ).resolves.toMatchObject({ arrived_at: RELEASED_AT });
    const released_event = await seeder.integrationEvent.findUniqueOrThrow({
      where: { id: submitted.event_id }
    });
    expect(released_event.status).toBe("PROCESSED");
    expect(released_event.processed_at).toBeInstanceOf(Date);
  });

  it("points a re-quarantined submission at the transmission the manager will read", async () => {
    // Completing a quarantined envio means reading its raw payload in
    // Integrações, so the submission must point at the one that arrived last —
    // not at the first attempt somebody has already given up on.
    const key = `quarantined-twice-${randomUUID()}`;
    const first = await submit(key);
    await applyIntakePlan(
      first.job,
      {
        kind: "QUARANTINE",
        lead_submission_id: first.lead_submission_id,
        integration_event_id: first.event_id
      },
      app
    );

    const again = await submit(key);
    await applyIntakePlan(
      again.job,
      {
        kind: "QUARANTINE",
        lead_submission_id: first.lead_submission_id,
        integration_event_id: again.event_id
      },
      app
    );

    await expect(
      seeder.leadSubmission.findUniqueOrThrow({ where: { id: first.lead_submission_id } })
    ).resolves.toMatchObject({
      last_integration_event_id: again.event_id,
      opportunity_id: null
    });
  });

  it("refuses to apply a plan for an event in another workspace", async () => {
    const submitted = await submit(`foreign-${randomUUID()}`);

    await expect(
      applyIntakePlan(
        createJobContext({
          workspace_id: neighbour_workspace,
          integration_event_id: submitted.event_id
        }),
        {
          kind: "QUARANTINE",
          lead_submission_id: submitted.lead_submission_id,
          integration_event_id: submitted.event_id
        },
        app
      )
    ).rejects.toThrow(/not visible/i);
  });
});

describe("findOpenOpportunitiesOfPerson", () => {
  it("answers nothing for a Pessoa that does not exist yet", async () => {
    const never = new Proxy(
      {},
      {
        get() {
          throw new Error("a Pessoa that is about to be created must not be queried for");
        }
      }
    ) as never;

    await expect(findOpenOpportunitiesOfPerson(context, null, never)).resolves.toEqual([]);
  });

  it("lists the open, unmerged cards of one Pessoa and nobody else's", async () => {
    const person_id = randomUUID();
    await seeder.person.create({
      data: { id: person_id, workspace_id: workspace, name: "Dupla" }
    });

    const open_ids: string[] = [];
    for (const [index, status] of (["OPEN", "OPEN", "WON", "LOST"] as const).entries()) {
      const opportunity = await seeder.opportunity.create({
        data: {
          workspace_id: workspace,
          person_id,
          pipeline_id: default_pipeline,
          stage_id: default_entry_stage,
          area: "COMMERCIAL",
          status,
          arrived_at: new Date(RECEIVED_AT.getTime() + index)
        }
      });
      if (status === "OPEN") {
        open_ids.push(opportunity.id);
      }
    }
    // A merged card is out of every active view, so it never links a new one:
    // the warning would land where nobody looks.
    const merged = await seeder.opportunity.create({
      data: {
        workspace_id: workspace,
        person_id,
        pipeline_id: default_pipeline,
        stage_id: default_entry_stage,
        area: "COMMERCIAL",
        status: "OPEN",
        arrived_at: RECEIVED_AT
      }
    });
    const canonical = open_ids[0];
    if (!canonical) {
      throw new Error("expected an open card to merge into");
    }
    await seeder.opportunity.update({
      where: { id: merged.id },
      data: { merged_into_opportunity_id: canonical }
    });

    const found = await findOpenOpportunitiesOfPerson(context, person_id, app);
    expect([...found].sort()).toEqual([...open_ids].sort());
  });

  it("never sees another workspace's card, even for a Pessoa that exists there", async () => {
    await seeder.opportunity.create({
      data: {
        workspace_id: neighbour_workspace,
        person_id: neighbour_person,
        pipeline_id: (
          await seeder.pipeline.findFirstOrThrow({ where: { workspace_id: neighbour_workspace } })
        ).id,
        stage_id: (
          await seeder.stage.findFirstOrThrow({
            where: { workspace_id: neighbour_workspace, role: "ENTRY" }
          })
        ).id,
        area: "COMMERCIAL",
        arrived_at: RECEIVED_AT
      }
    });

    await expect(findOpenOpportunitiesOfPerson(context, neighbour_person, app)).resolves.toEqual(
      []
    );
  });
});
