import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { completeActivity, createActivity } from "../src/activities.js";
import { resolveIntakeReview } from "../src/intake-review.js";
import { moveLeadStage } from "../src/lead-board.js";
import { listLeadTimeline } from "../src/lead-timeline.js";
import { assignLead, reassignLead } from "../src/leads.js";
import { detachWorkspaceMember } from "../src/team.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) {
  throw new Error("DATABASE_URL is required for database tests");
}

function appRoleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c role=marctco_app");
  return parsed.toString();
}

const UUID_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

const seeder = new PrismaClient({ datasources: { db: { url: database_url } } });
const app = new PrismaClient({ datasources: { db: { url: appRoleUrl(database_url) } } });

const workspace = randomUUID();
const neighbour_workspace = randomUUID();
const pipeline = randomUUID();
const entry_stage = randomUUID();
const contact_stage = randomUUID();
const neighbour_pipeline = randomUUID();
const neighbour_entry_stage = randomUUID();
const connection_id = randomUUID();
const attendant_user = randomUUID();
const other_attendant_user = randomUUID();
const manager_user = randomUUID();
const supervisor_user = randomUUID();
const untagged_supervisor_user = randomUUID();
const same_team_user = randomUUID();
const detach_target_user = randomUUID();

const manager_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const attendant_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: attendant_user,
  role: "ATTENDANT"
});
const other_attendant_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: other_attendant_user,
  role: "ATTENDANT"
});
const supervisor_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: supervisor_user,
  role: "SUPERVISOR"
});
const untagged_supervisor_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: untagged_supervisor_user,
  role: "SUPERVISOR"
});

let arrival_clock = new Date("2026-08-19T08:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedOpportunity(options: {
  readonly workspace_id?: string;
  readonly assigned_user_id?: string | null;
  readonly person_id?: string;
} = {}): Promise<string> {
  const workspace_id = options.workspace_id ?? workspace;
  const pipeline_id = workspace_id === neighbour_workspace ? neighbour_pipeline : pipeline;
  const stage_id = workspace_id === neighbour_workspace ? neighbour_entry_stage : entry_stage;
  const person_id =
    options.person_id ??
    (
      await seeder.person.create({
        data: { workspace_id, name: "Lead da linha do tempo" }
      })
    ).id;
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id,
      person_id,
      pipeline_id,
      stage_id,
      area: "COMMERCIAL",
      status: "OPEN",
      arrived_at: nextArrival(),
      assigned_user_id: options.assigned_user_id === undefined ? attendant_user : options.assigned_user_id
    }
  });
  return opportunity.id;
}

function dueAt(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Linha do tempo" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Vizinho" }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: pipeline,
        workspace_id: workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: entry_stage, label: "Novo lead", position: 1, role: "ENTRY" },
            { id: contact_stage, label: "Contato", position: 2, role: "NORMAL" },
            { label: "Conclusao", position: 3, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.pipeline.create({
      data: {
        id: neighbour_pipeline,
        workspace_id: neighbour_workspace,
        name: "Comercial vizinho",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: neighbour_entry_stage, label: "Entrada", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace, user_id: manager_user, role: "MANAGER", display_name: "Marina Gestao" },
        { workspace_id: workspace, user_id: attendant_user, role: "ATTENDANT", display_name: "Ana Atendente" },
        {
          workspace_id: workspace,
          user_id: other_attendant_user,
          role: "ATTENDANT",
          display_name: "Bruno Colega"
        },
        {
          workspace_id: workspace,
          user_id: supervisor_user,
          role: "SUPERVISOR",
          display_name: "Sofia Supervisora"
        },
        {
          workspace_id: workspace,
          user_id: untagged_supervisor_user,
          role: "SUPERVISOR",
          display_name: "Supervisora sem tag"
        },
        { workspace_id: workspace, user_id: same_team_user, role: "ATTENDANT", display_name: "Time ACR" },
        {
          workspace_id: workspace,
          user_id: detach_target_user,
          role: "ATTENDANT",
          display_name: "Carlos Desatrelado"
        },
        {
          workspace_id: neighbour_workspace,
          user_id: manager_user,
          role: "MANAGER",
          display_name: "Marina Gestao"
        }
      ]
    });
    const tag = await transaction.tag.create({ data: { workspace_id: workspace, name: "ACR" } });
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: attendant_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: same_team_user, tag_id: tag.id }
      ]
    });
    await transaction.integrationConnection.create({
      data: {
        id: connection_id,
        workspace_id: workspace,
        provider: "PLUGA",
        token_hash: `${randomUUID().replaceAll("-", "")}${randomUUID().replaceAll("-", "").slice(0, 32)}`,
        token_last4: "abcd"
      }
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("listLeadTimeline", () => {
  it("lists facts oldest-first, with the previous owner by name on reassignment", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: null });
    await assignLead(manager_context, { opportunity_id, user_id: supervisor_user }, app);
    await reassignLead(
      supervisor_context,
      { opportunity_id, current_user_id: supervisor_user, user_id: attendant_user },
      app
    );
    await moveLeadStage(
      attendant_context,
      { opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Ligacao sem resposta", due_at: dueAt(1) },
      app
    );
    await completeActivity(attendant_context, created.id, app);

    const page = await listLeadTimeline(attendant_context, opportunity_id, {}, app);
    expect(page.facts.map((fact) => fact.type)).toEqual([
      "ASSIGNED",
      "REASSIGNED",
      "STAGE_CHANGED",
      "ACTIVITY_CREATED",
      "ACTIVITY_COMPLETED"
    ]);
    const reassigned = page.facts[1];
    expect(reassigned?.previous_assigned_user_name).toBe("Sofia Supervisora");
    expect(reassigned?.assigned_user_name).toBe("Ana Atendente");
    expect(reassigned?.previous_assigned_user_name).not.toMatch(UUID_PATTERN);
    expect(reassigned?.assigned_user_name).not.toMatch(UUID_PATTERN);

    const completed = page.facts[4];
    expect(completed).toMatchObject({
      activity_title: "Ligacao sem resposta",
      activity_type: "CALL",
      activity_actor_name: "Ana Atendente"
    });
    expect(page.has_more).toBe(false);
  });

  it("keeps the two ingestion facts visible, without turning them into a generic model", async () => {
    const opportunity_id = await seedOpportunity();
    const event_id = randomUUID();
    const submission = await seeder.leadSubmission.create({
      data: {
        workspace_id: workspace,
        source: "META_LEAD_ADS",
        external_lead_id: `timeline-${randomUUID()}`,
        last_integration_event_id: (
          await seeder.integrationEvent.create({
            data: {
              id: event_id,
              workspace_id: workspace,
              integration_connection_id: connection_id,
              raw: { nome: "Maria" }
            }
          })
        ).id,
        opportunity_id
      }
    });
    await seeder.opportunityTimelineEvent.createMany({
      data: [
        {
          workspace_id: workspace,
          opportunity_id,
          type: "RETRANSMISSION_RECEIVED",
          lead_submission_id: submission.id,
          integration_event_id: event_id,
          occurred_at: new Date("2026-08-19T09:00:00.000Z")
        },
        {
          workspace_id: workspace,
          opportunity_id,
          type: "SUBMISSION_REENTERED",
          lead_submission_id: submission.id,
          integration_event_id: event_id,
          occurred_at: new Date("2026-08-19T10:00:00.000Z")
        }
      ]
    });

    const page = await listLeadTimeline(manager_context, opportunity_id, {}, app);
    expect(page.facts.map((fact) => fact.type)).toEqual([
      "RETRANSMISSION_RECEIVED",
      "SUBMISSION_REENTERED"
    ]);
    expect(page.facts.every((fact) => fact.ingestion_source === "META_LEAD_ADS")).toBe(true);
    expect(page.facts.every((fact) => fact.activity_title === null)).toBe(true);
  });

  it("names the destination of an assignment", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: null });
    await assignLead(manager_context, { opportunity_id, user_id: supervisor_user }, app);
    const page = await listLeadTimeline(manager_context, opportunity_id, {}, app);
    expect(page.facts).toEqual([
      expect.objectContaining({
        type: "ASSIGNED",
        assigned_user_name: "Sofia Supervisora"
      })
    ]);
    expect(page.facts[0]?.assigned_user_name).not.toMatch(UUID_PATTERN);
  });

  it("names who left when a lead returns to the queue", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: detach_target_user });
    await detachWorkspaceMember(manager_context, detach_target_user, app);

    const page = await listLeadTimeline(manager_context, opportunity_id, {}, app);
    expect(page.facts.map((fact) => fact.type)).toEqual(["RETURNED_TO_QUEUE"]);
    expect(page.facts[0]?.previous_assigned_user_name).toBe("Carlos Desatrelado");
    expect(page.facts[0]?.previous_assigned_user_name).not.toMatch(UUID_PATTERN);
  });

  it("applies the same Opportunity scope Fase 2 already uses", async () => {
    const mine = await seedOpportunity({ assigned_user_id: attendant_user });
    await moveLeadStage(
      attendant_context,
      { opportunity_id: mine, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    const colleagues = await seedOpportunity({ assigned_user_id: other_attendant_user });
    await moveLeadStage(
      other_attendant_context,
      { opportunity_id: colleagues, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );

    expect((await listLeadTimeline(attendant_context, mine, {}, app)).facts).toHaveLength(1);
    expect(await listLeadTimeline(attendant_context, colleagues, {}, app)).toEqual({
      facts: [],
      has_more: false
    });
    expect((await listLeadTimeline(supervisor_context, mine, {}, app)).facts).toHaveLength(1);
    expect(await listLeadTimeline(untagged_supervisor_context, mine, {}, app)).toEqual({
      facts: [],
      has_more: false
    });
    expect((await listLeadTimeline(manager_context, mine, {}, app)).facts).toHaveLength(1);
  });

  it("does not leak a neighbour workspace and does not follow a merge tombstone", async () => {
    const foreign = await seedOpportunity({
      workspace_id: neighbour_workspace,
      assigned_user_id: manager_user
    });
    expect(await listLeadTimeline(manager_context, foreign, {}, app)).toEqual({
      facts: [],
      has_more: false
    });

    const person = await seeder.person.create({
      data: { workspace_id: workspace, name: "Pessoa mesclada" }
    });
    const canonical_id = await seedOpportunity({ person_id: person.id });
    const absorbed_id = await seedOpportunity({ person_id: person.id });
    await moveLeadStage(
      attendant_context,
      { opportunity_id: absorbed_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: absorbed_id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: canonical_id
      }
    });
    await resolveIntakeReview(
      manager_context,
      {
        review_id: review.id,
        resolution: "SAME_FINANCING",
        reason: "Mesmo financiamento",
        resolved_at: new Date("2026-08-19T12:00:00.000Z")
      },
      app
    );

    expect(await listLeadTimeline(manager_context, absorbed_id, {}, app)).toEqual({
      facts: [],
      has_more: false
    });
    const canonical = await listLeadTimeline(manager_context, canonical_id, {}, app);
    expect(canonical.facts.map((fact) => fact.type)).toContain("STAGE_CHANGED");
    expect(canonical.facts.some((fact) => fact.type === "SUBMISSION_REENTERED")).toBe(false);
  });

  it("caps the read at the most recent facts and reports when older ones remain", async () => {
    const opportunity_id = await seedOpportunity();
    const rows = Array.from({ length: 3 }, (_, index) => ({
      workspace_id: workspace,
      opportunity_id,
      type: "STAGE_CHANGED" as const,
      occurred_at: new Date(Date.UTC(2026, 7, 19, 11, index))
    }));
    await seeder.opportunityTimelineEvent.createMany({ data: rows });

    const page = await listLeadTimeline(manager_context, opportunity_id, { limit: 2 }, app);
    expect(page.facts).toHaveLength(2);
    expect(page.has_more).toBe(true);
    expect(page.facts.map((fact) => fact.occurred_at.toISOString())).toEqual([
      "2026-08-19T11:01:00.000Z",
      "2026-08-19T11:02:00.000Z"
    ]);
  });
});
