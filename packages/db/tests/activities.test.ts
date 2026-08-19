import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import {
  ActivityError,
  cancelActivity,
  completeActivity,
  createActivity,
  listLeadActivities,
  rescheduleActivity
} from "../src/activities.js";

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
const pipeline = randomUUID();
const entry_stage = randomUUID();
const neighbour_pipeline = randomUUID();
const neighbour_entry_stage = randomUUID();
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

let arrival_clock = new Date("2026-08-17T12:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedOpportunity(options: {
  readonly assigned_user_id?: string | null;
  readonly status?: "OPEN" | "WON" | "LOST";
  readonly merged_into_opportunity_id?: string | null;
  readonly workspace_id?: string;
} = {}): Promise<string> {
  const workspace_id = options.workspace_id ?? workspace;
  const person = await seeder.person.create({
    data: { workspace_id, name: "Lead de atividade" }
  });
  const arrived_at = nextArrival();
  const status = options.status ?? "OPEN";
  const closed_at =
    status === "OPEN" ? null : new Date(arrived_at.getTime() + 30 * 60_000);
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id,
      person_id: person.id,
      pipeline_id: workspace_id === workspace ? pipeline : neighbour_pipeline,
      stage_id: workspace_id === workspace ? entry_stage : neighbour_entry_stage,
      area: "COMMERCIAL",
      status,
      arrived_at,
      closed_at,
      assigned_user_id: options.assigned_user_id ?? attendant_user,
      merged_into_opportunity_id: options.merged_into_opportunity_id ?? null
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
        { id: workspace, slug: randomUUID(), name: "Atividades" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Atividades vizinho" }
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
            { label: "Conclusao", position: 2, role: "CLOSING" }
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
            { id: neighbour_entry_stage, label: "Novo lead", position: 1, role: "ENTRY" },
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

describe("createActivity", () => {
  it("creates an activity bound to the lead, defaulting the responsible to the actor", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      {
        opportunity_id,
        type: "CALL",
        title: "Retornar amanhã",
        notes: "Cliente pediu 15h",
        due_at: dueAt(24)
      },
      app
    );
    expect(created.opportunity_id).toBe(opportunity_id);
    expect(created.assigned_user_id).toBe(attendant_user);
    expect(created.status).toBe("OPEN");
    expect(created.completed_at).toBeNull();
    expect(created.canceled_at).toBeNull();
    expect(created.type).toBe("CALL");
  });

  it("refuses a won, lost or merged lead", async () => {
    const won = await seedOpportunity({ status: "WON" });
    const lost = await seedOpportunity({ status: "LOST" });
    const canonical = await seedOpportunity();
    const merged = await seedOpportunity({ merged_into_opportunity_id: canonical });

    await expect(
      createActivity(
        manager_context,
        { opportunity_id: won, type: "TASK", title: "Não", due_at: dueAt(1) },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_CLOSED" });
    await expect(
      createActivity(
        manager_context,
        { opportunity_id: lost, type: "TASK", title: "Não", due_at: dueAt(1) },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_CLOSED" });
    await expect(
      createActivity(
        manager_context,
        { opportunity_id: merged, type: "TASK", title: "Não", due_at: dueAt(1) },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_MERGED" });
  });

  it("refuses an Attendant creating for a colleague", async () => {
    const opportunity_id = await seedOpportunity();
    await expect(
      createActivity(
        attendant_context,
        {
          opportunity_id,
          type: "TASK",
          title: "Para a Bia",
          due_at: dueAt(1),
          assigned_user_id: other_attendant_user
        },
        app
      )
    ).rejects.toMatchObject({ reason: "ASSIGNEE_NOT_ALLOWED" });
  });

  it("lets a tagged Supervisor create for the team and refuses outside it", async () => {
    const teamLead = await seedOpportunity({ assigned_user_id: same_team_user });
    const created = await createActivity(
      supervisor_context,
      {
        opportunity_id: teamLead,
        type: "MESSAGE",
        title: "Cobrar documentos",
        due_at: dueAt(2),
        assigned_user_id: same_team_user
      },
      app
    );
    expect(created.assigned_user_id).toBe(same_team_user);

    await expect(
      createActivity(
        supervisor_context,
        {
          opportunity_id: teamLead,
          type: "TASK",
          title: "Fora do time",
          due_at: dueAt(1),
          assigned_user_id: other_team_user
        },
        app
      )
    ).rejects.toMatchObject({ reason: "ASSIGNEE_NOT_ALLOWED" });
  });

  it("lets an untagged Supervisor designate only themselves, and still cannot open a lead", async () => {
    const ownCard = await seedOpportunity({ assigned_user_id: untagged_supervisor_user });
    await expect(
      createActivity(
        untagged_supervisor_context,
        {
          opportunity_id: ownCard,
          type: "TASK",
          title: "Para um colega",
          due_at: dueAt(1),
          assigned_user_id: attendant_user
        },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_NOT_VISIBLE" });
    await expect(
      createActivity(
        untagged_supervisor_context,
        { opportunity_id: ownCard, type: "TASK", title: "Para mim", due_at: dueAt(1) },
        app
      )
    ).rejects.toMatchObject({ reason: "OPPORTUNITY_NOT_VISIBLE" });
  });

  it("lets Gestão and Direção create for any ACTIVE member who reaches the lead", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: attendant_user });
    const fromManager = await createActivity(
      manager_context,
      {
        opportunity_id,
        type: "MEETING",
        title: "Reunião Gestão",
        due_at: dueAt(3),
        assigned_user_id: attendant_user
      },
      app
    );
    expect(fromManager.assigned_user_id).toBe(attendant_user);
    const fromOwner = await createActivity(
      owner_context,
      {
        opportunity_id,
        type: "TASK",
        title: "Tarefa Direção",
        due_at: dueAt(4),
        assigned_user_id: attendant_user
      },
      app
    );
    expect(fromOwner.created_by_user_id).toBe(owner_user);
  });

  it("refuses a responsible who cannot reach that lead", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: attendant_user });
    await expect(
      createActivity(
        manager_context,
        {
          opportunity_id,
          type: "TASK",
          title: "Para quem não vê o card",
          due_at: dueAt(1),
          assigned_user_id: other_team_user
        },
        app
      )
    ).rejects.toMatchObject({ reason: "ASSIGNEE_CANNOT_REACH_LEAD" });
  });
});

describe("completeActivity, cancelActivity, rescheduleActivity", () => {
  it("records who completed and when, and refuses completing again", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Primeira ligação", due_at: dueAt(1) },
      app
    );
    const done = await completeActivity(attendant_context, created.id, app);
    expect(done.status).toBe("DONE");
    expect(done.completed_by_user_id).toBe(attendant_user);
    expect(done.completed_at).toBeInstanceOf(Date);
    expect(done.canceled_at).toBeNull();

    await expect(completeActivity(attendant_context, created.id, app)).rejects.toMatchObject({
      reason: "ALREADY_DONE"
    });
  });

  it("lets the database arbitrate two concurrent completions into one winner", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "TASK", title: "Duplo clique", due_at: dueAt(1) },
      app
    );
    const settled = await Promise.allSettled([
      completeActivity(attendant_context, created.id, app),
      completeActivity(manager_context, created.id, app)
    ]);
    const fulfilled = settled.filter((result) => result.status === "fulfilled");
    const rejected = settled.filter((result) => result.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect((rejected[0] as PromiseRejectedResult).reason).toBeInstanceOf(ActivityError);
    expect(((rejected[0] as PromiseRejectedResult).reason as ActivityError).reason).toBe("ALREADY_DONE");

    const stored = await seeder.activity.findUniqueOrThrow({ where: { id: created.id } });
    expect(stored.status).toBe("DONE");
    expect(stored.completed_by_user_id).not.toBeNull();
  });

  it("keeps cancel distinct from complete: no completed_at and not attendance", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "MEETING", title: "Cliente desmarcou", due_at: dueAt(1) },
      app
    );
    const canceled = await cancelActivity(attendant_context, created.id, app);
    expect(canceled.status).toBe("CANCELED");
    expect(canceled.canceled_at).toBeInstanceOf(Date);
    expect(canceled.completed_at).toBeNull();
    expect(canceled.completed_by_user_id).toBeNull();
  });

  it("reschedules due_at without touching completion", async () => {
    const opportunity_id = await seedOpportunity();
    const created = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Adiar", due_at: dueAt(1) },
      app
    );
    const later = dueAt(48);
    const moved = await rescheduleActivity(
      attendant_context,
      { activity_id: created.id, due_at: later },
      app
    );
    expect(moved.status).toBe("OPEN");
    expect(moved.due_at.toISOString()).toBe(later.toISOString());
    expect(moved.completed_at).toBeNull();
    expect(moved.canceled_at).toBeNull();
  });
});

describe("listLeadActivities", () => {
  it("lists a lead's activities in the Opportunity scope, empty for an untagged Supervisor", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: attendant_user });
    await createActivity(
      attendant_context,
      { opportunity_id, type: "TASK", title: "Aberta", due_at: dueAt(2) },
      app
    );
    const overdue = await createActivity(
      attendant_context,
      { opportunity_id, type: "CALL", title: "Vencida", due_at: dueAt(-2) },
      app
    );
    await completeActivity(attendant_context, overdue.id, app);

    const mine = await listLeadActivities(attendant_context, opportunity_id, app);
    expect(mine.map((row) => row.title)).toEqual(["Aberta", "Vencida"]);

    const colleagues = await seedOpportunity({ assigned_user_id: other_attendant_user });
    await createActivity(
      other_attendant_context,
      { opportunity_id: colleagues, type: "TASK", title: "Dela", due_at: dueAt(1) },
      app
    );
    expect(await listLeadActivities(attendant_context, colleagues, app)).toEqual([]);

    const team = await listLeadActivities(supervisor_context, opportunity_id, app);
    expect(team.length).toBe(2);

    expect(await listLeadActivities(untagged_supervisor_context, opportunity_id, app)).toEqual([]);
    expect(await listLeadActivities(manager_context, opportunity_id, app)).toHaveLength(2);
  });

  it("does not leak a neighbour workspace's activities", async () => {
    const foreign = await seedOpportunity({
      workspace_id: neighbour_workspace,
      assigned_user_id: manager_user
    });
    expect(await listLeadActivities(manager_context, foreign, app)).toEqual([]);
  });

  it("scopes read by the Opportunity, not by who is responsible for the activity", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: attendant_user });
    await createActivity(
      manager_context,
      {
        opportunity_id,
        type: "TASK",
        title: "Gestão marcou para si",
        due_at: dueAt(4),
        assigned_user_id: manager_user
      },
      app
    );
    const visible = await listLeadActivities(attendant_context, opportunity_id, app);
    expect(visible).toHaveLength(1);
    expect(visible[0]?.assigned_user_id).toBe(manager_user);
  });

  it("keeps an overdue open activity in the list instead of hiding it", async () => {
    const opportunity_id = await seedOpportunity({ assigned_user_id: attendant_user });
    await createActivity(
      attendant_context,
      {
        opportunity_id,
        type: "CALL",
        title: "Vencida em aberto",
        due_at: dueAt(-3)
      },
      app
    );
    const rows = await listLeadActivities(attendant_context, opportunity_id, app);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.status).toBe("OPEN");
    expect(rows[0]?.title).toBe("Vencida em aberto");
  });
});

describe("activity schema invariants", () => {
  it("refuses an orphan row at the database — every activity belongs to a lead", async () => {
    await expect(
      seeder.$executeRawUnsafe(`
        INSERT INTO activities (
          id, workspace_id, assigned_user_id, type, title, due_at, status,
          created_by_user_id, updated_at
        ) VALUES (
          '${randomUUID()}', '${workspace}', '${attendant_user}', 'TASK',
          'Sem lead', CURRENT_TIMESTAMP, 'OPEN', '${attendant_user}', CURRENT_TIMESTAMP
        )
      `)
    ).rejects.toThrow(/23502|null value in column "opportunity_id"|violates not-null constraint/i);
  });
});
