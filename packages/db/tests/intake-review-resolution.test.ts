import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createJobContext,
  createUserContextFromResolvedMembership
} from "../src/access-context.js";
import {
  applyIntakePlan,
  findOpenOpportunitiesOfPerson,
  recordLeadSubmission
} from "../src/intake.js";
import { resolveIntakeReview } from "../src/intake-review.js";
import { mergePersons } from "../src/person-merge.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

function appRoleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c role=marctco_app");
  return parsed.toString();
}

const seeder = new PrismaClient({ datasources: { db: { url: database_url } } });
const app = new PrismaClient({ datasources: { db: { url: appRoleUrl(database_url) } } });

const workspace_id = randomUUID();
const owner_user_id = randomUUID();
const pipeline_id = randomUUID();
const stage_id = randomUUID();
const closing_stage_id = randomUUID();
const person_id = randomUUID();
const candidate_person_id = randomUUID();
const connection_id = randomUUID();
const resolved_at = new Date("2026-08-10T18:00:00.000Z");

const context = createUserContextFromResolvedMembership({
  workspace_id,
  user_id: owner_user_id,
  role: "OWNER"
});

async function seedPossibleDuplicate(): Promise<{
  review_id: string;
  canonical_opportunity_id: string;
  reviewed_opportunity_id: string;
  reviewed_submission_id: string;
}> {
  const canonical_opportunity_id = randomUUID();
  const reviewed_opportunity_id = randomUUID();
  const review_id = randomUUID();
  const integration_event_id = randomUUID();
  const reviewed_submission_id = randomUUID();
  await seeder.opportunity.createMany({
    data: [
      {
        id: canonical_opportunity_id,
        workspace_id,
        person_id,
        pipeline_id,
        stage_id,
        area: "COMMERCIAL",
        status: "OPEN",
        arrived_at: new Date("2026-08-09T10:00:00.000Z")
      },
      {
        id: reviewed_opportunity_id,
        workspace_id,
        person_id,
        pipeline_id,
        stage_id,
        area: "COMMERCIAL",
        status: "OPEN",
        arrived_at: new Date("2026-08-10T10:00:00.000Z")
      }
    ]
  });
  await seeder.intakeReview.create({
    data: {
      id: review_id,
      workspace_id,
      opportunity_id: reviewed_opportunity_id,
      type: "POSSIBLE_DUPLICATE",
      related_opportunity_id: canonical_opportunity_id
    }
  });
  await seeder.integrationEvent.create({
    data: {
      id: integration_event_id,
      workspace_id,
      integration_connection_id: connection_id,
      raw: { external_lead_id: reviewed_submission_id },
      received_at: new Date("2026-08-10T10:00:00.000Z")
    }
  });
  await seeder.leadSubmission.create({
    data: {
      id: reviewed_submission_id,
      workspace_id,
      source: "META_LEAD_ADS",
      external_lead_id: reviewed_submission_id,
      last_integration_event_id: integration_event_id,
      opportunity_id: reviewed_opportunity_id,
      received_at: new Date("2026-08-10T10:00:00.000Z")
    }
  });
  return {
    review_id,
    canonical_opportunity_id,
    reviewed_opportunity_id,
    reviewed_submission_id
  };
}

beforeAll(async () => {
  await seeder.workspace.create({
    data: {
      id: workspace_id,
      slug: randomUUID(),
      name: "Resoluções",
      members: { create: { user_id: owner_user_id, role: "OWNER" } },
      pipelines: {
        create: {
          id: pipeline_id,
          name: "Comercial",
          type: "COMMERCIAL",
          is_default: true,
          stages: {
            create: [
              { id: stage_id, label: "Entrada", position: 1, role: "ENTRY" },
              { id: closing_stage_id, label: "Conclusão", position: 2, role: "CLOSING" }
            ]
          }
        }
      },
      persons: {
        create: [
          { id: person_id, name: "Maria" },
          { id: candidate_person_id, name: "Maria candidata" }
        ]
      },
      integration_connections: {
        create: {
          id: connection_id,
          provider: "PLUGA",
          token_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
          token_last4: "abcd"
        }
      }
    }
  });
});

afterAll(async () => {
  await seeder.workspace.delete({ where: { id: workspace_id } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("resolveIntakeReview", () => {
  it("records NEW_FINANCING once and leaves both Opportunities independent", async () => {
    const fixture = await seedPossibleDuplicate();

    await expect(
      resolveIntakeReview(
        context,
        {
          review_id: fixture.review_id,
          resolution: "NEW_FINANCING",
          reason: "Contratos conferidos com o cliente",
          resolved_at
        },
        app
      )
    ).resolves.toEqual({
      review_id: fixture.review_id,
      resolution: "NEW_FINANCING"
    });

    const reviews = await seeder.$queryRaw<
      Array<{
        resolution: string | null;
        resolved_by_user_id: string | null;
        resolved_at: Date | null;
        resolution_reason: string | null;
      }>
    >`
      SELECT resolution::text, resolved_by_user_id, resolved_at, resolution_reason
      FROM intake_reviews
      WHERE id = ${fixture.review_id}::uuid
    `;
    expect(reviews).toEqual([
      {
        resolution: "NEW_FINANCING",
        resolved_by_user_id: owner_user_id,
        resolved_at,
        resolution_reason: "Contratos conferidos com o cliente"
      }
    ]);

    const cards = await seeder.opportunity.findMany({
      where: {
        id: { in: [fixture.canonical_opportunity_id, fixture.reviewed_opportunity_id] }
      },
      orderBy: { arrived_at: "asc" }
    });
    expect(cards.map(({ status, merged_into_opportunity_id }) => ({
      status,
      merged_into_opportunity_id
    }))).toEqual([
      { status: "OPEN", merged_into_opportunity_id: null },
      { status: "OPEN", merged_into_opportunity_id: null }
    ]);
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({
        where: { id: fixture.reviewed_submission_id }
      })
    ).resolves.toMatchObject({ opportunity_id: fixture.reviewed_opportunity_id });

    await expect(
      resolveIntakeReview(
        context,
        {
          review_id: fixture.review_id,
          resolution: "INVALID_OR_SPAM",
          reason: "Tentativa concorrente",
          resolved_at
        },
        app
      )
    ).rejects.toThrow(/already resolved/i);
  });

  it("merges by transferring every FK, records re-entry, and sends later resends to the canonical card", async () => {
    const fixture = await seedPossibleDuplicate();
    const first_event_id = randomUUID();
    const canonical_event_id = randomUUID();
    const absorbed_submission_id = randomUUID();
    const canonical_submission_id = randomUUID();
    const identity_review_id = randomUUID();

    await seeder.integrationEvent.createMany({
      data: [
        {
          id: first_event_id,
          workspace_id,
          integration_connection_id: connection_id,
          raw: { external_lead_id: "absorbed" },
          received_at: new Date("2026-08-10T10:00:00.000Z")
        },
        {
          id: canonical_event_id,
          workspace_id,
          integration_connection_id: connection_id,
          raw: { external_lead_id: "canonical" },
          received_at: new Date("2026-08-09T10:00:00.000Z")
        }
      ]
    });
    await seeder.leadSubmission.createMany({
      data: [
        {
          id: absorbed_submission_id,
          workspace_id,
          source: "META_LEAD_ADS",
          external_lead_id: `absorbed-${randomUUID()}`,
          last_integration_event_id: first_event_id,
          opportunity_id: fixture.reviewed_opportunity_id,
          received_at: new Date("2026-08-10T10:00:00.000Z")
        },
        {
          id: canonical_submission_id,
          workspace_id,
          source: "META_LEAD_ADS",
          external_lead_id: `canonical-${randomUUID()}`,
          last_integration_event_id: canonical_event_id,
          opportunity_id: fixture.canonical_opportunity_id,
          received_at: new Date("2026-08-09T10:00:00.000Z")
        }
      ]
    });
    await seeder.opportunityTimelineEvent.create({
      data: {
        workspace_id,
        opportunity_id: fixture.reviewed_opportunity_id,
        type: "RETRANSMISSION_RECEIVED",
        lead_submission_id: absorbed_submission_id,
        integration_event_id: first_event_id,
        occurred_at: new Date("2026-08-10T10:00:00.000Z")
      }
    });
    await seeder.intakeReview.create({
      data: {
        id: identity_review_id,
        workspace_id,
        opportunity_id: fixture.reviewed_opportunity_id,
        type: "IDENTITY_CONFLICT",
        candidate_person_ids: [candidate_person_id]
      }
    });

    await resolveIntakeReview(
      context,
      {
        review_id: fixture.review_id,
        resolution: "SAME_FINANCING",
        reason: "É a mesma operação de crédito",
        resolved_at
      },
      app
    );

    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: fixture.reviewed_opportunity_id } })
    ).resolves.toMatchObject({
      merged_into_opportunity_id: fixture.canonical_opportunity_id
    });
    await expect(
      seeder.leadSubmission.findMany({
        where: { id: { in: [absorbed_submission_id, canonical_submission_id] } },
        orderBy: { received_at: "asc" }
      })
    ).resolves.toMatchObject([
      { id: canonical_submission_id, opportunity_id: fixture.canonical_opportunity_id },
      { id: absorbed_submission_id, opportunity_id: fixture.canonical_opportunity_id }
    ]);
    const transferred_reviews = await seeder.intakeReview.findMany({
      where: { id: { in: [fixture.review_id, identity_review_id] } },
      orderBy: { id: "asc" }
    });
    expect(transferred_reviews.map((review) => review.opportunity_id)).toEqual([
      fixture.canonical_opportunity_id,
      fixture.canonical_opportunity_id
    ]);
    expect(
      transferred_reviews.every(
        (review) => review.related_opportunity_id !== fixture.reviewed_opportunity_id
      )
    ).toBe(true);

    const timeline = await seeder.opportunityTimelineEvent.findMany({
      where: { lead_submission_id: absorbed_submission_id },
      orderBy: { occurred_at: "asc" }
    });
    expect(timeline).toMatchObject([
      {
        opportunity_id: fixture.canonical_opportunity_id,
        type: "RETRANSMISSION_RECEIVED",
        integration_event_id: first_event_id
      },
      {
        opportunity_id: fixture.canonical_opportunity_id,
        type: "SUBMISSION_REENTERED",
        integration_event_id: first_event_id,
        occurred_at: resolved_at
      }
    ]);

    const resend_event_id = randomUUID();
    await seeder.integrationEvent.create({
      data: {
        id: resend_event_id,
        workspace_id,
        integration_connection_id: connection_id,
        raw: { external_lead_id: "absorbed" },
        received_at: new Date("2026-08-11T10:00:00.000Z")
      }
    });
    const absorbed_submission = await seeder.leadSubmission.findUniqueOrThrow({
      where: { id: absorbed_submission_id }
    });
    const job = createJobContext({ workspace_id, integration_event_id: resend_event_id });
    const duplicate = await recordLeadSubmission(
      job,
      {
        key: {
          source: "META_LEAD_ADS",
          external_lead_id: absorbed_submission.external_lead_id
        },
        integration_event_id: resend_event_id,
        received_at: new Date("2026-08-11T10:00:00.000Z")
      },
      app
    );
    expect(duplicate).toMatchObject({
      kind: "DUPLICATE",
      opportunity_id: fixture.canonical_opportunity_id
    });
    await applyIntakePlan(
      job,
      {
        kind: "RETRANSMISSION",
        lead_submission_id: absorbed_submission_id,
        opportunity_id: fixture.canonical_opportunity_id,
        integration_event_id: resend_event_id
      },
      app
    );
    await expect(
      seeder.opportunityTimelineEvent.findFirstOrThrow({
        where: { integration_event_id: resend_event_id }
      })
    ).resolves.toMatchObject({ opportunity_id: fixture.canonical_opportunity_id });
    const active = await findOpenOpportunitiesOfPerson(context, person_id, app);
    expect(active).toContain(fixture.canonical_opportunity_id);
    expect(active).not.toContain(fixture.reviewed_opportunity_id);
  });

  it("archives INVALID_OR_SPAM with its reason and physically preserves the card", async () => {
    const fixture = await seedPossibleDuplicate();

    await resolveIntakeReview(
      context,
      {
        review_id: fixture.review_id,
        resolution: "INVALID_OR_SPAM",
        reason: "Envio confirmado como spam",
        resolved_at
      },
      app
    );

    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: fixture.reviewed_opportunity_id } })
    ).resolves.toMatchObject({
      status: "LOST",
      merged_into_opportunity_id: null
    });
    await expect(
      seeder.intakeReview.findUniqueOrThrow({ where: { id: fixture.review_id } })
    ).resolves.toMatchObject({
      opportunity_id: fixture.reviewed_opportunity_id,
      related_opportunity_id: fixture.canonical_opportunity_id,
      resolution: "INVALID_OR_SPAM",
      resolved_by_user_id: owner_user_id,
      resolved_at,
      resolution_reason: "Envio confirmado como spam"
    });
    await expect(
      seeder.leadSubmission.findUniqueOrThrow({
        where: { id: fixture.reviewed_submission_id }
      })
    ).resolves.toMatchObject({ opportunity_id: fixture.reviewed_opportunity_id });
  });

  it("transfers a merged Pessoa's FKs and marks newly co-located open cards as possible duplicates", async () => {
    const canonical_person_id = randomUUID();
    const absorbed_person_id = randomUUID();
    const earlier_opportunity_id = randomUUID();
    const later_opportunity_id = randomUUID();
    const shared_phone = "+5511999999999";

    await seeder.person.createMany({
      data: [
        { id: canonical_person_id, workspace_id, name: "Canônica" },
        { id: absorbed_person_id, workspace_id, name: "Absorvida" }
      ]
    });
    await seeder.personPhone.createMany({
      data: [
        { workspace_id, person_id: canonical_person_id, phone_e164: shared_phone },
        { workspace_id, person_id: absorbed_person_id, phone_e164: shared_phone },
        { workspace_id, person_id: absorbed_person_id, phone_e164: "+5511888888888" }
      ]
    });
    await seeder.opportunity.createMany({
      data: [
        {
          id: earlier_opportunity_id,
          workspace_id,
          person_id: canonical_person_id,
          pipeline_id,
          stage_id,
          area: "COMMERCIAL",
          status: "OPEN",
          arrived_at: new Date("2026-08-01T10:00:00.000Z")
        },
        {
          id: later_opportunity_id,
          workspace_id,
          person_id: absorbed_person_id,
          pipeline_id,
          stage_id,
          area: "COMMERCIAL",
          status: "OPEN",
          arrived_at: new Date("2026-08-02T10:00:00.000Z")
        }
      ]
    });

    await mergePersons(
      context,
      { absorbed_person_id, canonical_person_id },
      app
    );

    await expect(
      seeder.person.findUniqueOrThrow({ where: { id: absorbed_person_id } })
    ).resolves.toMatchObject({ merged_into_person_id: canonical_person_id });
    await expect(
      seeder.opportunity.findMany({
        where: { id: { in: [earlier_opportunity_id, later_opportunity_id] } },
        orderBy: { arrived_at: "asc" }
      })
    ).resolves.toMatchObject([
      { person_id: canonical_person_id },
      { person_id: canonical_person_id }
    ]);
    await expect(
      seeder.personPhone.findMany({
        where: { phone_e164: { in: [shared_phone, "+5511888888888"] } },
        orderBy: { phone_e164: "asc" }
      })
    ).resolves.toSatisfy(
      (phones: Array<{ person_id: string }>) =>
        phones.length === 2 && phones.every((phone) => phone.person_id === canonical_person_id)
    );
    await expect(
      seeder.intakeReview.findFirstOrThrow({
        where: {
          opportunity_id: later_opportunity_id,
          related_opportunity_id: earlier_opportunity_id,
          type: "POSSIBLE_DUPLICATE",
          resolution: null
        }
      })
    ).resolves.toBeTruthy();
  });
});
