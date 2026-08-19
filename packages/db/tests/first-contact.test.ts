import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import {
  cancelActivity,
  completeActivity,
  createActivity
} from "../src/activities.js";
import { moveLeadStage } from "../src/lead-board.js";
import {
  assignLead,
  assignLeads,
  getLead,
  listLeads,
  reassignLead,
  reassignLeads
} from "../src/leads.js";

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

const workspace = randomUUID();
const pipeline = randomUUID();
const entry_stage = randomUUID();
const contact_stage = randomUUID();
const attendant_user = randomUUID();
const manager_user = randomUUID();
const supervisor_user = randomUUID();
const same_team_user = randomUUID();

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
const supervisor_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: supervisor_user,
  role: "SUPERVISOR"
});

let arrival_clock = new Date("2026-08-17T12:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedOpportunity(options: {
  readonly assigned_user_id?: string | null;
  readonly status?: "OPEN" | "WON" | "LOST";
  readonly arrived_at?: Date;
  readonly closed_at?: Date | null;
} = {}): Promise<string> {
  const person = await seeder.person.create({
    data: { workspace_id: workspace, name: "Lead de primeiro contato" }
  });
  const arrived_at = options.arrived_at ?? nextArrival();
  const status = options.status ?? "OPEN";
  const closed_at =
    status === "OPEN"
      ? null
      : options.closed_at === undefined
        ? new Date(arrived_at.getTime() + 30 * 60_000)
        : options.closed_at;
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id: workspace,
      person_id: person.id,
      pipeline_id: pipeline,
      stage_id: entry_stage,
      area: "COMMERCIAL",
      status,
      arrived_at,
      closed_at,
      assigned_user_id: options.assigned_user_id === undefined ? attendant_user : options.assigned_user_id
    }
  });
  return opportunity.id;
}

async function firstContactAt(opportunity_id: string): Promise<Date | null> {
  const row = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
  return row.first_contact_at;
}

function dueAt(hoursFromNow: number): Date {
  return new Date(Date.now() + hoursFromNow * 60 * 60 * 1000);
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Primeiro contato" }
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
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace, user_id: manager_user, role: "MANAGER", display_name: "Marina Gestão" },
        { workspace_id: workspace, user_id: attendant_user, role: "ATTENDANT", display_name: "Ana Atendente" },
        { workspace_id: workspace, user_id: supervisor_user, role: "SUPERVISOR", display_name: "Sofia Supervisora" },
        { workspace_id: workspace, user_id: same_team_user, role: "ATTENDANT", display_name: "Time ACR" }
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
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: workspace } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("first_contact_at", () => {
  it("stamps first_contact_at in the same transaction as the first completion", async () => {
    const opportunity_id = await seedOpportunity();
    expect(await firstContactAt(opportunity_id)).toBeNull();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Primeira ligação", due_at: dueAt(1) },
      app
    );
    const done = await completeActivity(attendant_context, created.id, app);
    const stamped = await firstContactAt(opportunity_id);
    expect(stamped).not.toBeNull();
    expect(stamped?.toISOString()).toBe(done.completed_at?.toISOString());
  });

  it("does not overwrite first_contact_at on a second completion", async () => {
    const opportunity_id = await seedOpportunity();
    const first = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Primeira", due_at: dueAt(1) },
      app
    );
    const second = await createActivity(
      attendant_context,
      { opportunity_id, type: "TASK", title: "Segunda", due_at: dueAt(2) },
      app
    );
    await completeActivity(attendant_context, first.id, app);
    const original = await firstContactAt(opportunity_id);
    await new Promise((resolve) => setTimeout(resolve, 20));
    await completeActivity(attendant_context, second.id, app);
    expect((await firstContactAt(opportunity_id))?.toISOString()).toBe(original?.toISOString());
  });

  it("lets the database arbitrate two concurrent first completions of different activities", async () => {
    const opportunity_id = await seedOpportunity();
    const first = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Corrida A", due_at: dueAt(1) },
      app
    );
    const second = await createActivity(
      attendant_context,
      { opportunity_id, type: "TASK", title: "Corrida B", due_at: dueAt(1) },
      app
    );
    const settled = await Promise.allSettled([
      completeActivity(attendant_context, first.id, app),
      completeActivity(manager_context, second.id, app)
    ]);
    expect(settled.filter((result) => result.status === "fulfilled")).toHaveLength(2);
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
    expect(stored.first_contact_at).not.toBeNull();
    const activities = await seeder.activity.findMany({
      where: { opportunity_id },
      orderBy: { created_at: "asc" }
    });
    expect(activities.every((row) => row.status === "DONE")).toBe(true);
  });

  it("does not treat cancel as attendance", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "MEETING", title: "Desmarcada", due_at: dueAt(1) },
      app
    );
    await cancelActivity(attendant_context, created.id, app);
    expect(await firstContactAt(opportunity_id)).toBeNull();
  });

  it("does not stamp first_contact_at when assigning a lead", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: null });
    await assignLead(manager_context, { opportunity_id, user_id: supervisor_user }, app);
    expect(await firstContactAt(opportunity_id)).toBeNull();
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
    expect(stored.assigned_user_id).toBe(supervisor_user);
  });

  it("does not stamp first_contact_at when assigning a batch", async () => {
    const first = await seedOpportunity({ assigned_user_id: null });
    const second = await seedOpportunity({ assigned_user_id: null });
    await assignLeads(manager_context, { opportunity_ids: [first, second], user_id: supervisor_user }, app);
    expect(await firstContactAt(first)).toBeNull();
    expect(await firstContactAt(second)).toBeNull();
  });

  it("does not stamp first_contact_at when reassigning a lead", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: supervisor_user });
    await reassignLead(
      supervisor_context,
      { opportunity_id, current_user_id: supervisor_user, user_id: same_team_user },
      app
    );
    expect(await firstContactAt(opportunity_id)).toBeNull();
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
    expect(stored.assigned_user_id).toBe(same_team_user);
  });

  it("does not stamp first_contact_at when reassigning a batch", async () => {
    const first = await seedOpportunity({ assigned_user_id: supervisor_user });
    const second = await seedOpportunity({ assigned_user_id: supervisor_user });
    await reassignLeads(
      supervisor_context,
      {
        assignments: [
          { opportunity_id: first, current_user_id: supervisor_user },
          { opportunity_id: second, current_user_id: supervisor_user }
        ],
        user_id: same_team_user
      },
      app
    );
    expect(await firstContactAt(first)).toBeNull();
    expect(await firstContactAt(second)).toBeNull();
  });

  it("does not stamp first_contact_at when moving a lead's stage", async () => {
    const opportunity_id = await seedOpportunity();
    await moveLeadStage(
      attendant_context,
      { opportunity_id, current_stage_id: entry_stage, stage_id: contact_stage },
      app
    );
    expect(await firstContactAt(opportunity_id)).toBeNull();
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: opportunity_id } });
    expect(stored.stage_id).toBe(contact_stage);
  });

  it("exposes first_contact_at and status on the list and the card for the SLA function", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Lista", due_at: dueAt(1) },
      app
    );
    await completeActivity(attendant_context, created.id, app);
    const listed = (await listLeads(manager_context, { limit: 200 }, app)).find(
      (row) => row.opportunity_id === opportunity_id
    );
    const card = await getLead(manager_context, opportunity_id, app);
    expect(listed?.first_contact_at).not.toBeNull();
    expect(listed?.status).toBe("OPEN");
    expect(listed?.closed_at).toBeNull();
    expect(card.first_contact_at?.toISOString()).toBe(listed?.first_contact_at?.toISOString());
    expect(card.status).toBe("OPEN");
    expect(card.closed_at).toBeNull();
    expect(listed?.last_movement_at).not.toBeNull();
    expect(card.last_movement_at?.toISOString()).toBe(listed?.last_movement_at?.toISOString());
  });

  it("exposes closed_at on the list and the card for a lead closed without contact", async () => {
    const arrived_at = new Date("2026-08-17T12:00:00.000Z");
    const closed_at = new Date(arrived_at.getTime() + 45 * 60_000);
    const opportunity_id = await seedOpportunity({
      status: "LOST",
      arrived_at,
      closed_at,
      assigned_user_id: attendant_user
    });
    const listed = (await listLeads(manager_context, { limit: 200 }, app)).find(
      (row) => row.opportunity_id === opportunity_id
    );
    const card = await getLead(manager_context, opportunity_id, app);
    expect(listed?.closed_at?.toISOString()).toBe(closed_at.toISOString());
    expect(card.closed_at?.toISOString()).toBe(closed_at.toISOString());
    expect(listed?.first_contact_at).toBeNull();
  });
});
