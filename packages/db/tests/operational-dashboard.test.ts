import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import {
  OperationalDashboardError,
  getOperationalDashboard
} from "../src/operational-dashboard.js";

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

const now = new Date("2026-08-19T15:00:00.000Z");
const workspace = randomUUID();
const neighbour_workspace = randomUUID();
const pipeline = randomUUID();
const neighbour_pipeline = randomUUID();
const entry_stage = randomUUID();
const mid_stage = randomUUID();
const neighbour_stage = randomUUID();

const attendant_user = randomUUID();
const other_team_user = randomUUID();
const supervisor_user = randomUUID();
const untagged_supervisor_user = randomUUID();
const manager_user = randomUUID();
const owner_user = randomUUID();
const neighbour_manager = randomUUID();

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
const neighbour_context = createUserContextFromResolvedMembership({
  workspace_id: neighbour_workspace,
  user_id: neighbour_manager,
  role: "MANAGER"
});

function minutesAgo(minutes: number): Date {
  return new Date(now.getTime() - minutes * 60_000);
}

function daysAgo(days: number): Date {
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

async function seedOpportunity(options: {
  readonly workspace_id?: string;
  readonly pipeline_id?: string;
  readonly stage_id?: string;
  readonly assigned_user_id?: string | null;
  readonly status?: "OPEN" | "WON" | "LOST";
  readonly arrived_at?: Date;
  readonly first_contact_at?: Date | null;
  readonly last_movement_at?: Date | null;
  readonly merged_into_opportunity_id?: string | null;
} = {}): Promise<string> {
  const workspace_id = options.workspace_id ?? workspace;
  const person = await seeder.person.create({
    data: { workspace_id, name: "Lead do dashboard" }
  });
  const arrived_at = options.arrived_at ?? minutesAgo(10);
  const status = options.status ?? "OPEN";
  const closed_at = status === "OPEN" ? null : new Date(arrived_at.getTime() + 30 * 60_000);
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id,
      person_id: person.id,
      pipeline_id: options.pipeline_id ?? pipeline,
      stage_id: options.stage_id ?? entry_stage,
      area: "COMMERCIAL",
      status,
      arrived_at,
      closed_at,
      first_contact_at: options.first_contact_at ?? null,
      last_movement_at: options.last_movement_at === undefined ? arrived_at : options.last_movement_at,
      assigned_user_id: options.assigned_user_id === undefined ? attendant_user : options.assigned_user_id,
      merged_into_opportunity_id: options.merged_into_opportunity_id ?? null
    }
  });
  return opportunity.id;
}

async function seedActivity(options: {
  readonly opportunity_id: string;
  readonly due_at: Date;
  readonly status?: "OPEN" | "DONE" | "CANCELED";
  readonly assigned_user_id?: string;
}): Promise<void> {
  await seeder.activity.create({
    data: {
      workspace_id: workspace,
      opportunity_id: options.opportunity_id,
      assigned_user_id: options.assigned_user_id ?? attendant_user,
      type: "CALL",
      title: "Atividade do dashboard",
      due_at: options.due_at,
      status: options.status ?? "OPEN",
      created_by_user_id: attendant_user,
      ...(options.status === "DONE"
        ? { completed_at: now, completed_by_user_id: attendant_user }
        : {}),
      ...(options.status === "CANCELED" ? { canceled_at: now } : {})
    }
  });
}

function tileCount(
  dashboard: Awaited<ReturnType<typeof getOperationalDashboard>>,
  id: "sla_breached" | "stagnant" | "unassigned" | "overdue_activities"
): number {
  const tile = dashboard.tiles.find((item) => item.id === id);
  if (!tile) {
    throw new Error(`missing tile ${id}`);
  }
  return tile.count;
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Dashboard" }
    });
    await transaction.workspace.create({
      data: { id: neighbour_workspace, slug: randomUUID(), name: "Vizinho" }
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
            { id: mid_stage, label: "Em atendimento", position: 2, role: "NORMAL" },
            { label: "Conclusao", position: 3, role: "CLOSING" }
          ]
        }
      }
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
            { id: neighbour_stage, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.workspaceMember.createMany({
      data: [
        { workspace_id: workspace, user_id: attendant_user, role: "ATTENDANT", display_name: "Ana" },
        { workspace_id: workspace, user_id: other_team_user, role: "ATTENDANT", display_name: "Bia" },
        { workspace_id: workspace, user_id: supervisor_user, role: "SUPERVISOR", display_name: "Sofia" },
        {
          workspace_id: workspace,
          user_id: untagged_supervisor_user,
          role: "SUPERVISOR",
          display_name: "Sem tag"
        },
        { workspace_id: workspace, user_id: manager_user, role: "MANAGER", display_name: "Marina" },
        { workspace_id: workspace, user_id: owner_user, role: "OWNER", display_name: "Direcao" },
        {
          workspace_id: neighbour_workspace,
          user_id: neighbour_manager,
          role: "MANAGER",
          display_name: "Vizinha"
        }
      ]
    });
    const tag = await transaction.tag.create({ data: { workspace_id: workspace, name: "ACR" } });
    const other_tag = await transaction.tag.create({
      data: { workspace_id: workspace, name: "Outro" }
    });
    await transaction.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: attendant_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: other_team_user, tag_id: other_tag.id }
      ]
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("getOperationalDashboard", () => {
  it("refuses an Atendente — hiding the nav item is not access control", async () => {
    await expect(getOperationalDashboard(attendant_context, { now }, app)).rejects.toMatchObject({
      reason: "FORBIDDEN"
    });
    await expect(getOperationalDashboard(attendant_context, { now }, app)).rejects.toBeInstanceOf(
      OperationalDashboardError
    );
  });

  it("counts OPEN leads that have waited the full first-contact budget, including the exact limit", async () => {
    const breached = await seedOpportunity({ arrived_at: minutesAgo(120) });
    await seedOpportunity({ arrived_at: minutesAgo(119) });
    const dashboard = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(dashboard, "sla_breached")).toBeGreaterThanOrEqual(1);
    const afterDelete = await getOperationalDashboard(manager_context, { now }, app);
    await seeder.opportunity.delete({ where: { id: breached } });
    const without = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(afterDelete, "sla_breached") - tileCount(without, "sla_breached")).toBe(1);
  });

  it("does not count WON, LOST or merged leads as burning SLA or stagnation", async () => {
    const before = await getOperationalDashboard(manager_context, { now }, app);
    const canonical = await seedOpportunity({ arrived_at: minutesAgo(10) });
    await seedOpportunity({
      status: "WON",
      arrived_at: minutesAgo(240),
      assigned_user_id: attendant_user
    });
    await seedOpportunity({
      status: "LOST",
      arrived_at: minutesAgo(240),
      assigned_user_id: attendant_user
    });
    await seedOpportunity({
      arrived_at: daysAgo(10),
      last_movement_at: null,
      merged_into_opportunity_id: canonical
    });
    const after = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(after, "sla_breached")).toBe(tileCount(before, "sla_breached"));
    expect(tileCount(after, "stagnant")).toBe(tileCount(before, "stagnant"));
  });

  it("counts a stagnant OPEN lead at the exact seven-day budget, not a day earlier", async () => {
    const stagnant = await seedOpportunity({
      arrived_at: daysAgo(7),
      last_movement_at: daysAgo(7)
    });
    await seedOpportunity({
      arrived_at: daysAgo(6),
      last_movement_at: daysAgo(6)
    });
    const withStagnant = await getOperationalDashboard(manager_context, { now }, app);
    await seeder.opportunity.delete({ where: { id: stagnant } });
    const without = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(withStagnant, "stagnant") - tileCount(without, "stagnant")).toBe(1);
  });

  it("anchors stagnation at arrived_at when the lead has never moved", async () => {
    const forgotten = await seedOpportunity({
      arrived_at: daysAgo(7),
      last_movement_at: null
    });
    const withForgotten = await getOperationalDashboard(manager_context, { now }, app);
    await seeder.opportunity.delete({ where: { id: forgotten } });
    const without = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(withForgotten, "stagnant") - tileCount(without, "stagnant")).toBe(1);
  });

  it("counts the ownerless queue for Gestão and Direção, and zeros it for Supervisor", async () => {
    const unassigned = await seedOpportunity({ assigned_user_id: null, arrived_at: minutesAgo(5) });
    const managerView = await getOperationalDashboard(manager_context, { now }, app);
    const ownerView = await getOperationalDashboard(owner_context, { now }, app);
    const supervisorView = await getOperationalDashboard(supervisor_context, { now }, app);
    expect(tileCount(managerView, "unassigned")).toBeGreaterThanOrEqual(1);
    expect(tileCount(ownerView, "unassigned")).toBe(tileCount(managerView, "unassigned"));
    expect(tileCount(supervisorView, "unassigned")).toBe(0);
    await seeder.opportunity.delete({ where: { id: unassigned } });
  });

  it("counts overdue OPEN activities and ignores future or completed ones", async () => {
    const opportunity_id = await seedOpportunity({ arrived_at: minutesAgo(5) });
    await seedActivity({ opportunity_id, due_at: minutesAgo(1) });
    await seedActivity({ opportunity_id, due_at: new Date(now.getTime() + 60_000) });
    await seedActivity({ opportunity_id, due_at: minutesAgo(30), status: "DONE" });
    const withOverdue = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(withOverdue, "overdue_activities")).toBeGreaterThanOrEqual(1);
    await seeder.activity.deleteMany({ where: { opportunity_id } });
    const without = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(withOverdue, "overdue_activities") - tileCount(without, "overdue_activities")).toBe(1);
    await seeder.opportunity.delete({ where: { id: opportunity_id } });
  });

  it("scopes a tagged Supervisor to the team and never to the other team", async () => {
    const teamLead = await seedOpportunity({
      assigned_user_id: attendant_user,
      arrived_at: minutesAgo(180)
    });
    const otherLead = await seedOpportunity({
      assigned_user_id: other_team_user,
      arrived_at: minutesAgo(180)
    });
    const supervisorView = await getOperationalDashboard(supervisor_context, { now }, app);
    const managerView = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(supervisorView, "sla_breached")).toBeGreaterThanOrEqual(1);
    expect(tileCount(managerView, "sla_breached")).toBeGreaterThan(tileCount(supervisorView, "sla_breached"));
    await seeder.opportunity.deleteMany({ where: { id: { in: [teamLead, otherLead] } } });
  });

  it("returns zeros and names the missing tag for a Supervisor without a team", async () => {
    await seedOpportunity({ assigned_user_id: attendant_user, arrived_at: minutesAgo(180) });
    const dashboard = await getOperationalDashboard(untagged_supervisor_context, { now }, app);
    expect(dashboard.tiles.map((tile) => tile.count)).toEqual([0, 0, 0, 0]);
    expect(dashboard.empty_state).toEqual({ reason: "SUPERVISOR_WITHOUT_TEAM" });
  });

  it("does not treat a tagged Supervisor's real zeros as a missing-team empty state", async () => {
    const dashboard = await getOperationalDashboard(supervisor_context, { now }, app);
    if (dashboard.tiles.every((tile) => tile.count === 0)) {
      expect(dashboard.empty_state).toBeNull();
    } else {
      expect(dashboard.empty_state).toBeNull();
    }
  });

  it("never shows another workspace's burning leads", async () => {
    await seedOpportunity({
      workspace_id: neighbour_workspace,
      pipeline_id: neighbour_pipeline,
      stage_id: neighbour_stage,
      assigned_user_id: neighbour_manager,
      arrived_at: minutesAgo(240)
    });
    const neighbourView = await getOperationalDashboard(neighbour_context, { now }, app);
    const homeView = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(neighbourView, "sla_breached")).toBeGreaterThanOrEqual(1);
    expect(tileCount(homeView, "sla_breached")).toBeLessThan(tileCount(neighbourView, "sla_breached") + 1000);
    const isolated = await getOperationalDashboard(manager_context, { now }, app);
    expect(isolated.tiles.every((tile) => Number.isInteger(tile.count))).toBe(true);
  });

  it("uses the workspace clock settings, not the domain defaults, to decide a breach", async () => {
    await seeder.workspaceSettings.create({
      data: {
        workspace_id: workspace,
        first_contact_sla_minutes: 30,
        stagnation_days: 3
      }
    });
    const before = await getOperationalDashboard(manager_context, { now }, app);
    const tight = await seedOpportunity({ arrived_at: minutesAgo(30) });
    const after = await getOperationalDashboard(manager_context, { now }, app);
    expect(tileCount(after, "sla_breached") - tileCount(before, "sla_breached")).toBe(1);
    await seeder.opportunity.delete({ where: { id: tight } });
    await seeder.workspaceSettings.delete({ where: { workspace_id: workspace } });
  });

  it("always returns four tiles with click destinations, even when every count is zero", async () => {
    const dashboard = await getOperationalDashboard(untagged_supervisor_context, { now }, app);
    expect(dashboard.tiles).toHaveLength(4);
    expect(dashboard.tiles.map((tile) => tile.destination.screen)).toEqual([
      "leads",
      "leads",
      "leads",
      "agenda"
    ]);
    expect(dashboard.tiles[0]?.destination.query).toEqual({ clock: "sla-breached" });
    expect(dashboard.tiles[2]?.destination.query).toEqual({ responsible: "unassigned" });
    expect(dashboard.tiles[3]?.destination.query).toEqual({ due: "overdue" });
  });

  it("returns fourteen arrival days, SLA points and every default-funnel stage", async () => {
    const dashboard = await getOperationalDashboard(untagged_supervisor_context, { now }, app);
    expect(dashboard.series.arrivals).toHaveLength(14);
    expect(dashboard.series.sla_adherence).toHaveLength(14);
    expect(dashboard.series.arrivals[0]?.day).toBe("2026-08-06");
    expect(dashboard.series.arrivals[13]?.day).toBe("2026-08-19");
    expect(dashboard.series.open_by_stage.map((point) => point.label)).toEqual([
      "Novo lead",
      "Em atendimento",
      "Conclusao"
    ]);
    expect(dashboard.series.open_by_stage.every((point) => point.count === 0)).toBe(true);
  });

  it("counts a closed arrival in the window and ignores merged and out-of-window leads", async () => {
    const before = await getOperationalDashboard(manager_context, { now }, app);
    const todayCount =
      before.series.arrivals.find((point) => point.day === "2026-08-19")?.count ?? 0;
    const yesterdayCount =
      before.series.arrivals.find((point) => point.day === "2026-08-18")?.count ?? 0;

    const canonical = await seedOpportunity({ arrived_at: minutesAgo(10) });
    const wonYesterday = await seedOpportunity({
      status: "WON",
      arrived_at: new Date("2026-08-18T15:00:00.000Z")
    });
    const outside = await seedOpportunity({
      status: "LOST",
      arrived_at: new Date("2026-08-01T15:00:00.000Z")
    });
    const merged = await seedOpportunity({
      arrived_at: minutesAgo(5),
      merged_into_opportunity_id: canonical
    });

    const after = await getOperationalDashboard(manager_context, { now }, app);
    expect(after.series.arrivals.find((point) => point.day === "2026-08-19")?.count).toBe(
      todayCount + 1
    );
    expect(after.series.arrivals.find((point) => point.day === "2026-08-18")?.count).toBe(
      yesterdayCount + 1
    );
    await seeder.opportunity.delete({ where: { id: merged } });
    await seeder.opportunity.deleteMany({
      where: { id: { in: [canonical, wonYesterday, outside] } }
    });
  });

  it("computes SLA adherence from firstContactSla, leaving pending days without a rate", async () => {
    const before = await getOperationalDashboard(manager_context, { now }, app);
    const beforeEighteenth = before.series.sla_adherence.find((point) => point.day === "2026-08-18");
    const beforeNineteenth = before.series.sla_adherence.find((point) => point.day === "2026-08-19");
    const met = await seedOpportunity({
      arrived_at: new Date("2026-08-18T12:00:00.000Z"),
      first_contact_at: new Date("2026-08-18T13:00:00.000Z")
    });
    const breached = await seedOpportunity({
      arrived_at: new Date("2026-08-18T12:00:00.000Z"),
      first_contact_at: new Date("2026-08-18T15:00:00.000Z")
    });
    const pending = await seedOpportunity({ arrived_at: minutesAgo(10) });
    const after = await getOperationalDashboard(manager_context, { now }, app);
    const eighteenth = after.series.sla_adherence.find((point) => point.day === "2026-08-18");
    const nineteenth = after.series.sla_adherence.find((point) => point.day === "2026-08-19");
    expect((eighteenth?.met ?? 0) - (beforeEighteenth?.met ?? 0)).toBe(1);
    expect((eighteenth?.breached ?? 0) - (beforeEighteenth?.breached ?? 0)).toBe(1);
    expect((nineteenth?.pending ?? 0) - (beforeNineteenth?.pending ?? 0)).toBe(1);
    await seeder.opportunity.deleteMany({ where: { id: { in: [met, breached, pending] } } });
  });

  it("groups open default-funnel leads by stage and keeps empty stages at zero", async () => {
    const entryLead = await seedOpportunity({ stage_id: entry_stage, arrived_at: minutesAgo(8) });
    const talkLead = await seedOpportunity({ stage_id: mid_stage, arrived_at: minutesAgo(8) });
    const talkLeadTwo = await seedOpportunity({ stage_id: mid_stage, arrived_at: minutesAgo(8) });
    const dashboard = await getOperationalDashboard(manager_context, { now }, app);
    const byId = new Map(dashboard.series.open_by_stage.map((point) => [point.stage_id, point.count]));
    expect(byId.get(entry_stage)).toBeGreaterThanOrEqual(1);
    expect(byId.get(mid_stage)).toBeGreaterThanOrEqual(2);
    expect(dashboard.series.open_by_stage.some((point) => point.count === 0)).toBe(true);
    await seeder.opportunity.deleteMany({
      where: { id: { in: [entryLead, talkLead, talkLeadTwo] } }
    });
  });

  it("scopes series to the Supervisor's team the same way it scopes tiles", async () => {
    const teamLead = await seedOpportunity({
      assigned_user_id: attendant_user,
      arrived_at: minutesAgo(15)
    });
    const otherLead = await seedOpportunity({
      assigned_user_id: other_team_user,
      arrived_at: minutesAgo(15)
    });
    const supervisorView = await getOperationalDashboard(supervisor_context, { now }, app);
    const managerView = await getOperationalDashboard(manager_context, { now }, app);
    const supervisorToday =
      supervisorView.series.arrivals.find((point) => point.day === "2026-08-19")?.count ?? 0;
    const managerToday =
      managerView.series.arrivals.find((point) => point.day === "2026-08-19")?.count ?? 0;
    expect(managerToday).toBeGreaterThan(supervisorToday);
    expect(supervisorToday).toBeGreaterThanOrEqual(1);
    await seeder.opportunity.deleteMany({ where: { id: { in: [teamLead, otherLead] } } });
  });
});
