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
const supervisor_user_id = randomUUID();
const teammate_user_id = randomUUID();
const outside_user_id = randomUUID();

const context = createUserContextFromResolvedMembership({
  workspace_id,
  user_id: owner_user_id,
  role: "OWNER"
});
const supervisor_context = createUserContextFromResolvedMembership({
  workspace_id,
  user_id: supervisor_user_id,
  role: "SUPERVISOR"
});

async function seedPossibleDuplicate(assigned_user_id?: string): Promise<{
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
        arrived_at: new Date("2026-08-10T10:00:00.000Z"),
        assigned_user_id: assigned_user_id ?? null
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
  await seeder.workspaceMember.createMany({
    data: [
      { workspace_id, user_id: supervisor_user_id, role: "SUPERVISOR" },
      { workspace_id, user_id: teammate_user_id, role: "ATTENDANT" },
      { workspace_id, user_id: outside_user_id, role: "ATTENDANT" }
    ]
  });
  const [teamTag, outsideTag] = await Promise.all([
    seeder.tag.create({ data: { workspace_id, name: "ACR" } }),
    seeder.tag.create({ data: { workspace_id, name: "REAL" } })
  ]);
  await seeder.memberTag.createMany({
    data: [
      { workspace_id, user_id: supervisor_user_id, tag_id: teamTag.id },
      { workspace_id, user_id: teammate_user_id, tag_id: teamTag.id },
      { workspace_id, user_id: outside_user_id, tag_id: outsideTag.id }
    ]
  });
});

afterAll(async () => {
  await seeder.workspace.delete({ where: { id: workspace_id } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("resolveIntakeReview", () => {
  it("refuses an unscoped Pessoa merge from Supervisor", async () => {
    await expect(
      mergePersons(
        supervisor_context,
        { absorbed_person_id: candidate_person_id, canonical_person_id: person_id },
        app
      )
    ).rejects.toThrow(/SUPERVISOR.*scoped review/i);
  });
  it("lets a Supervisor resolve only a review carried by their tagged team", async () => {
    const team = await seedPossibleDuplicate(teammate_user_id);
    await expect(
      resolveIntakeReview(
        supervisor_context,
        {
          review_id: team.review_id,
          resolution: "NEW_FINANCING",
          reason: "Conferido pelo time",
          resolved_at
        },
        app
      )
    ).resolves.toMatchObject({ review_id: team.review_id });

    const outside = await seedPossibleDuplicate(outside_user_id);
    await expect(
      resolveIntakeReview(
        supervisor_context,
        {
          review_id: outside.review_id,
          resolution: "NEW_FINANCING",
          reason: "Tentativa fora do time",
          resolved_at
        },
        app
      )
    ).rejects.toThrow(/not found/i);
  });
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

  it("arbitrates concurrent duplicate decisions into one audit row", async () => {
    const fixture = await seedPossibleDuplicate();
    const duplicate_review_id = randomUUID();
    await seeder.intakeReview.create({
      data: {
        id: duplicate_review_id,
        workspace_id,
        opportunity_id: fixture.canonical_opportunity_id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: fixture.reviewed_opportunity_id
      }
    });

    const results = await Promise.allSettled(
      [fixture.review_id, duplicate_review_id].map((review_id) =>
        resolveIntakeReview(
          context,
          {
            review_id,
            resolution: "NEW_FINANCING",
            reason: "Uma decisão para o mesmo par",
            resolved_at
          },
          app
        )
      )
    );
    expect(results.map((result) => result.status).sort()).toEqual(["fulfilled", "rejected"]);
    await expect(
      seeder.intakeReview.findMany({
        where: {
          id: { in: [fixture.review_id, duplicate_review_id] }
        }
      })
    ).resolves.toMatchObject([{ resolution: "NEW_FINANCING" }]);
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

  it("normalizes a three-Opportunity chain, collapses its pending pair, and leaves NEW_FINANCING unlinked", async () => {
    const oldest_opportunity_id = randomUUID();
    const intermediate_opportunity_id = randomUUID();
    const newest_opportunity_id = randomUUID();
    const newest_to_intermediate_review_id = randomUUID();
    await seeder.opportunity.createMany({
      data: [
        {
          id: oldest_opportunity_id,
          workspace_id,
          person_id,
          pipeline_id,
          stage_id,
          area: "COMMERCIAL",
          status: "OPEN",
          arrived_at: new Date("2026-08-01T10:00:00.000Z")
        },
        {
          id: intermediate_opportunity_id,
          workspace_id,
          person_id,
          pipeline_id,
          stage_id,
          area: "COMMERCIAL",
          status: "OPEN",
          arrived_at: new Date("2026-08-02T10:00:00.000Z")
        },
        {
          id: newest_opportunity_id,
          workspace_id,
          person_id,
          pipeline_id,
          stage_id,
          area: "COMMERCIAL",
          status: "OPEN",
          arrived_at: new Date("2026-08-03T10:00:00.000Z")
        }
      ]
    });
    await seeder.intakeReview.createMany({
      data: [
        {
          workspace_id,
          opportunity_id: intermediate_opportunity_id,
          type: "POSSIBLE_DUPLICATE",
          related_opportunity_id: oldest_opportunity_id
        },
        {
          id: newest_to_intermediate_review_id,
          workspace_id,
          opportunity_id: newest_opportunity_id,
          type: "POSSIBLE_DUPLICATE",
          related_opportunity_id: intermediate_opportunity_id
        },
        {
          workspace_id,
          opportunity_id: newest_opportunity_id,
          type: "POSSIBLE_DUPLICATE",
          related_opportunity_id: oldest_opportunity_id
        }
      ]
    });

    await resolveIntakeReview(
      context,
      {
        review_id: newest_to_intermediate_review_id,
        resolution: "SAME_FINANCING",
        reason: "O envio mais novo repete o financiamento intermediário",
        resolved_at
      },
      app
    );

    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: newest_opportunity_id } })
    ).resolves.toMatchObject({ merged_into_opportunity_id: intermediate_opportunity_id });
    const pending_after_merge = await seeder.intakeReview.findMany({
      where: {
        workspace_id,
        type: "POSSIBLE_DUPLICATE",
        resolution: null,
        opportunity_id: { in: [oldest_opportunity_id, intermediate_opportunity_id] },
        related_opportunity_id: { in: [oldest_opportunity_id, intermediate_opportunity_id] }
      }
    });
    expect(pending_after_merge).toHaveLength(1);
    expect(pending_after_merge[0]).toMatchObject({
      opportunity_id: intermediate_opportunity_id,
      related_opportunity_id: oldest_opportunity_id
    });

    await resolveIntakeReview(
      context,
      {
        review_id: pending_after_merge[0]!.id,
        resolution: "NEW_FINANCING",
        reason: "Os dois contratos restantes são distintos",
        resolved_at: new Date("2026-08-10T19:00:00.000Z")
      },
      app
    );
    await expect(
      seeder.intakeReview.count({
        where: {
          workspace_id,
          type: "POSSIBLE_DUPLICATE",
          resolution: null,
          OR: [
            {
              opportunity_id: intermediate_opportunity_id,
              related_opportunity_id: oldest_opportunity_id
            },
            {
              opportunity_id: oldest_opportunity_id,
              related_opportunity_id: intermediate_opportunity_id
            }
          ]
        }
      })
    ).resolves.toBe(0);
    await expect(
      seeder.intakeReview.findUniqueOrThrow({
        where: { id: newest_to_intermediate_review_id }
      })
    ).resolves.toMatchObject({ resolution: "SAME_FINANCING" });
  });

  it("uses id as the deterministic tie-breaker when arrivals are equal", async () => {
    const ids = [randomUUID(), randomUUID()].sort();
    const older_opportunity_id = ids[0]!;
    const newer_opportunity_id = ids[1]!;
    const inverted_review_id = randomUUID();
    const arrived_at = new Date("2026-08-04T10:00:00.000Z");
    await seeder.opportunity.createMany({
      data: ids.map((id) => ({
        id,
        workspace_id,
        person_id,
        pipeline_id,
        stage_id,
        area: "COMMERCIAL" as const,
        status: "OPEN" as const,
        arrived_at
      }))
    });
    await seeder.intakeReview.create({
      data: {
        id: inverted_review_id,
        workspace_id,
        opportunity_id: older_opportunity_id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: newer_opportunity_id
      }
    });

    await resolveIntakeReview(
      context,
      {
        review_id: inverted_review_id,
        resolution: "SAME_FINANCING",
        reason: "A ordem da revisão não decide a canônica",
        resolved_at
      },
      app
    );

    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: newer_opportunity_id } })
    ).resolves.toMatchObject({ merged_into_opportunity_id: older_opportunity_id });
    await expect(
      seeder.opportunity.findUniqueOrThrow({ where: { id: older_opportunity_id } })
    ).resolves.toMatchObject({ merged_into_opportunity_id: null });
  });

  it("keeps the explicit workspace scope even with an RLS-bypassing client", async () => {
    const foreign_workspace_id = randomUUID();
    const foreign_review_id = randomUUID();
    const foreign_opportunity_ids = [randomUUID(), randomUUID()];
    const foreign_person_id = randomUUID();
    const foreign_absorbed_person_id = randomUUID();
    const foreign_pipeline_id = randomUUID();
    const foreign_stage_id = randomUUID();
    const foreign_closing_stage_id = randomUUID();
    await seeder.workspace.create({
      data: {
        id: foreign_workspace_id,
        slug: randomUUID(),
        name: "Outro workspace",
        persons: {
          create: [
            { id: foreign_person_id, name: "Outra pessoa" },
            { id: foreign_absorbed_person_id, name: "Pessoa absorvível" }
          ]
        },
        pipelines: {
          create: {
            id: foreign_pipeline_id,
            name: "Comercial",
            type: "COMMERCIAL",
            is_default: true,
            stages: {
              create: [
                {
                  id: foreign_stage_id,
                  label: "Entrada",
                  position: 1,
                  role: "ENTRY"
                },
                {
                  id: foreign_closing_stage_id,
                  label: "Conclusão",
                  position: 2,
                  role: "CLOSING"
                }
              ]
            }
          }
        }
      }
    });
    await seeder.opportunity.createMany({
      data: foreign_opportunity_ids.map((id, index) => ({
        id,
        workspace_id: foreign_workspace_id,
        person_id: foreign_person_id,
        pipeline_id: foreign_pipeline_id,
        stage_id: foreign_stage_id,
        area: "COMMERCIAL" as const,
        status: "OPEN" as const,
        arrived_at: new Date(`2026-08-0${index + 1}T10:00:00.000Z`)
      }))
    });
    await seeder.intakeReview.create({
      data: {
        id: foreign_review_id,
        workspace_id: foreign_workspace_id,
        opportunity_id: foreign_opportunity_ids[1]!,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: foreign_opportunity_ids[0]!
      }
    });

    try {
      await expect(
        resolveIntakeReview(
          context,
          {
            review_id: foreign_review_id,
            resolution: "NEW_FINANCING",
            reason: "Não pode atravessar tenant",
            resolved_at
          },
          seeder
        )
      ).rejects.toThrow(/not found/i);
      await expect(
        seeder.intakeReview.findUniqueOrThrow({ where: { id: foreign_review_id } })
      ).resolves.toMatchObject({ resolution: null });
      await expect(
        mergePersons(
          context,
          {
            absorbed_person_id: foreign_absorbed_person_id,
            canonical_person_id: foreign_person_id
          },
          seeder
        )
      ).rejects.toThrow(/both Pessoas/i);
      await expect(
        seeder.person.findUniqueOrThrow({ where: { id: foreign_absorbed_person_id } })
      ).resolves.toMatchObject({ merged_into_person_id: null });
    } finally {
      await seeder.workspace.delete({ where: { id: foreign_workspace_id } });
    }
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
