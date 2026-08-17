import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { MAX_AGENDA_RANGE_MS } from "@marctco/domain";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { AgendaError, listAgenda } from "../src/agenda.js";
import { createActivity } from "../src/activities.js";

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
const neighbour_workspace = randomUUID();
const commercial_pipeline = randomUUID();
const legal_pipeline = randomUUID();
const neighbour_pipeline = randomUUID();
const commercial_entry = randomUUID();
const legal_entry = randomUUID();
const neighbour_entry = randomUUID();
const attendant_user = randomUUID();
const other_attendant_user = randomUUID();
const manager_user = randomUUID();
const owner_user = randomUUID();
const supervisor_user = randomUUID();
const untagged_supervisor_user = randomUUID();
const same_team_user = randomUUID();
const other_team_user = randomUUID();

const manager_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const owner_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: owner_user,
  role: "OWNER"
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
const untagged_supervisor_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: untagged_supervisor_user,
  role: "SUPERVISOR"
});

const window_from = new Date("2026-08-17T03:00:00.000Z");
const window_to = new Date("2026-08-18T03:00:00.000Z");
const inside = new Date("2026-08-17T15:00:00.000Z");
const overdue_inside = new Date("2026-08-17T08:00:00.000Z");
const outside = new Date("2026-08-19T15:00:00.000Z");

let shared_tag_id = "";
let other_tag_id = "";
let arrival_clock = new Date("2026-08-17T12:00:00.000Z").getTime();

function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedOpportunity(options: {
  readonly assigned_user_id?: string | null;
  readonly pipeline_id?: string;
  readonly stage_id?: string;
  readonly workspace_id?: string;
} = {}): Promise<string> {
  const workspace_id = options.workspace_id ?? workspace;
  const person = await seeder.person.create({
    data: { workspace_id, name: "Lead da agenda" }
  });
  const pipeline_id =
    options.pipeline_id ?? (workspace_id === workspace ? commercial_pipeline : neighbour_pipeline);
  const stage_id = options.stage_id ?? (workspace_id === workspace ? commercial_entry : neighbour_entry);
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id,
      person_id: person.id,
      pipeline_id,
      stage_id,
      area: "COMMERCIAL",
      status: "OPEN",
      arrived_at: nextArrival(),
      assigned_user_id: options.assigned_user_id ?? attendant_user
    }
  });
  return opportunity.id;
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Agenda" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Agenda vizinho" }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: commercial_pipeline,
        workspace_id: workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: commercial_entry, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.pipeline.create({
      data: {
        id: legal_pipeline,
        workspace_id: workspace,
        name: "Juridico",
        type: "LEGAL",
        is_default: false,
        stages: {
          create: [
            { id: legal_entry, label: "Entrada juridica", position: 1, role: "ENTRY" },
            { label: "Fim", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace, user_id: manager_user, role: "MANAGER", display_name: "Marina Gestão" },
        { workspace_id: workspace, user_id: owner_user, role: "OWNER", display_name: "Dora Direção" },
        { workspace_id: workspace, user_id: attendant_user, role: "ATTENDANT", display_name: "Ana Atendente" },
        { workspace_id: workspace, user_id: other_attendant_user, role: "ATTENDANT", display_name: "Bia Atendente" },
        { workspace_id: workspace, user_id: supervisor_user, role: "SUPERVISOR", display_name: "Sofia Supervisora" },
        { workspace_id: workspace, user_id: untagged_supervisor_user, role: "SUPERVISOR", display_name: "Supervisor sem tag" },
        { workspace_id: workspace, user_id: same_team_user, role: "ATTENDANT", display_name: "Time ACR" },
        { workspace_id: workspace, user_id: other_team_user, role: "ATTENDANT", display_name: "Time REAL" }
      ]
    });
    const [sharedTag, otherTag] = await Promise.all([
      transaction.tag.create({ data: { workspace_id: workspace, name: "ACR" } }),
      transaction.tag.create({ data: { workspace_id: workspace, name: "REAL" } })
    ]);
    shared_tag_id = sharedTag.id;
    other_tag_id = otherTag.id;
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: sharedTag.id },
        { workspace_id: workspace, user_id: attendant_user, tag_id: sharedTag.id },
        { workspace_id: workspace, user_id: same_team_user, tag_id: sharedTag.id },
        { workspace_id: workspace, user_id: other_team_user, tag_id: otherTag.id }
      ]
    });
    await transaction.pipeline.create({
      data: {
        id: neighbour_pipeline,
        workspace_id: neighbour_workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: neighbour_entry, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.workspaceMember.create({
      data: { workspace_id: neighbour_workspace, user_id: manager_user, role: "OWNER" }
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("listAgenda interval", () => {
  it("keeps the named window and refuses a calendar without a ceiling", async () => {
    const opportunity_id = await seedOpportunity();
    const visible = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Dentro", due_at: inside },
      app
    );
    await createActivity(
      attendant_context,
      { opportunity_id, type: "TASK", title: "Fora", due_at: outside },
      app
    );

    const view = await listAgenda(attendant_context, { from: window_from, to: window_to }, app);
    expect(view.items.map((row) => row.title)).toEqual(["Dentro"]);
    expect(view.items[0]?.id).toBe(visible.id);

    await expect(
      listAgenda(
        attendant_context,
        { from: window_from, to: new Date(window_from.getTime() + MAX_AGENDA_RANGE_MS + 1) },
        app
      )
    ).rejects.toMatchObject({ reason: "RANGE_TOO_LONG" });
    await expect(
      listAgenda(attendant_context, { from: window_to, to: window_from }, app)
    ).rejects.toBeInstanceOf(AgendaError);
  });
});

describe("listAgenda scope", () => {
  it("is the Opportunity's profile scope for every role", async () => {
    const mine = await seedOpportunity({ assigned_user_id: attendant_user });
    const colleague = await seedOpportunity({ assigned_user_id: other_attendant_user });
    const teamMate = await seedOpportunity({ assigned_user_id: same_team_user });
    await createActivity(attendant_context, { opportunity_id: mine, type: "TASK", title: "Da Ana", due_at: inside }, app);
    await createActivity(
      manager_context,
      {
        opportunity_id: colleague,
        type: "TASK",
        title: "Da Bia",
        due_at: inside,
        assigned_user_id: other_attendant_user
      },
      app
    );
    await createActivity(
      manager_context,
      {
        opportunity_id: teamMate,
        type: "TASK",
        title: "Do time",
        due_at: inside,
        assigned_user_id: same_team_user
      },
      app
    );

    const attendantView = await listAgenda(attendant_context, { from: window_from, to: window_to }, app);
    expect(attendantView.items.some((row) => row.title === "Da Ana")).toBe(true);
    expect(attendantView.items.some((row) => row.title === "Da Bia")).toBe(false);
    expect(attendantView.items.some((row) => row.title === "Do time")).toBe(false);

    const supervisorView = await listAgenda(supervisor_context, { from: window_from, to: window_to }, app);
    expect(supervisorView.items.some((row) => row.title === "Da Ana")).toBe(true);
    expect(supervisorView.items.some((row) => row.title === "Do time")).toBe(true);
    expect(supervisorView.items.some((row) => row.title === "Da Bia")).toBe(false);

    const untagged = await listAgenda(untagged_supervisor_context, { from: window_from, to: window_to }, app);
    expect(untagged.items).toEqual([]);

    const managerView = await listAgenda(manager_context, { from: window_from, to: window_to }, app);
    const ownerView = await listAgenda(owner_context, { from: window_from, to: window_to }, app);
    expect(managerView.items.some((row) => row.title === "Da Bia")).toBe(true);
    expect(ownerView.items.some((row) => row.title === "Da Bia")).toBe(true);
  });
});

describe("listAgenda filters", () => {
  it("narrows by responsible, tag and pipeline, and returns empty outside scope instead of refusing", async () => {
    const legalLead = await seedOpportunity({
      assigned_user_id: attendant_user,
      pipeline_id: legal_pipeline,
      stage_id: legal_entry
    });
    await createActivity(
      attendant_context,
      { opportunity_id: legalLead, type: "MEETING", title: "Juridico da Ana", due_at: inside },
      app
    );

    const byResponsible = await listAgenda(
      manager_context,
      { from: window_from, to: window_to, responsible_user_id: attendant_user },
      app
    );
    expect(byResponsible.items.every((row) => row.assigned_user_id === attendant_user)).toBe(true);
    expect(byResponsible.items.some((row) => row.title === "Da Bia")).toBe(false);

    const byPipeline = await listAgenda(
      manager_context,
      { from: window_from, to: window_to, pipeline_id: legal_pipeline },
      app
    );
    expect(byPipeline.items.map((row) => row.title)).toEqual(["Juridico da Ana"]);

    const foreignTeam = await listAgenda(
      supervisor_context,
      { from: window_from, to: window_to, tag_id: other_tag_id },
      app
    );
    expect(foreignTeam.items).toEqual([]);

    const ownTeam = await listAgenda(
      supervisor_context,
      { from: window_from, to: window_to, tag_id: shared_tag_id },
      app
    );
    expect(ownTeam.items.length).toBeGreaterThan(0);
    expect(ownTeam.items.some((row) => row.title === "Da Bia")).toBe(false);
  });
});

describe("listAgenda and the card share Activity", () => {
  it("shows the same row created on the card, keeps an overdue OPEN item, and refuses an orphan", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: attendant_user });
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Do card na Agenda", due_at: overdue_inside },
      app
    );
    const view = await listAgenda(attendant_context, { from: window_from, to: window_to }, app);
    const row = view.items.find((item) => item.id === created.id);
    expect(row).toMatchObject({
      opportunity_id,
      title: "Do card na Agenda",
      status: "OPEN"
    });
    expect(row?.due_at.getTime()).toBe(overdue_inside.getTime());

    await expect(
      createActivity(
        attendant_context,
        { opportunity_id: "", type: "TASK", title: "Orfa", due_at: inside },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_REQUIRED" });
  });
});
