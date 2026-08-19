import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { MAX_FIRST_CONTACT_SLA_MINUTES } from "@marctco/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createJobContext, createUserContextFromResolvedMembership } from "../src/access-context.js";
import { createActivity } from "../src/activities.js";
import { resolveIntakeReview } from "../src/intake-review.js";
import { markNotificationRead, NotificationError } from "../src/notifications.js";
import {
  claimWorkspacesWithOverdueOpportunities,
  sweepWorkspaceOpportunityClock
} from "../src/opportunity-clock.js";
import { updateWorkspaceSettings } from "../src/workspace-settings.js";

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

function clockJob(workspace_id: string) {
  return createJobContext({
    workspace_id,
    origin: { type: "scheduled_sweep", sweep: "OPPORTUNITY_CLOCK" }
  });
}

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
    data: { workspace_id, name: "Lead do relogio" }
  });
  const arrived_at = options.arrived_at ?? minutesAgo(10);
  const status = options.status ?? "OPEN";
  const closed_at = status === "OPEN" ? null : new Date(arrived_at.getTime() + 30 * 60_000);
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id,
      person_id: person.id,
      pipeline_id: options.pipeline_id ?? (workspace_id === workspace ? pipeline : neighbour_pipeline),
      stage_id: options.stage_id ?? (workspace_id === workspace ? entry_stage : neighbour_stage),
      area: "COMMERCIAL",
      status,
      arrived_at,
      closed_at,
      first_contact_at: options.first_contact_at ?? null,
      last_movement_at: options.last_movement_at === undefined ? arrived_at : options.last_movement_at,
      assigned_user_id:
        options.assigned_user_id === undefined ? attendant_user : options.assigned_user_id,
      merged_into_opportunity_id: options.merged_into_opportunity_id ?? null
    }
  });
  return opportunity.id;
}

async function seedIsolatedTenant(name: string): Promise<{
  readonly id: string;
  readonly pipeline_id: string;
  readonly entry_stage: string;
  readonly attendant_user: string;
  readonly owner_context: ReturnType<typeof createUserContextFromResolvedMembership>;
  readonly attendant_context: ReturnType<typeof createUserContextFromResolvedMembership>;
}> {
  const id = randomUUID();
  const pipeline_id = randomUUID();
  const entry_stage = randomUUID();
  const owner_user_id = randomUUID();
  const attendant_user_id = randomUUID();
  await seeder.workspace.create({
    data: {
      id,
      slug: randomUUID(),
      name,
      members: {
        create: [
          { user_id: owner_user_id, role: "OWNER", display_name: "Direcao" },
          { user_id: attendant_user_id, role: "ATTENDANT", display_name: "Ana" }
        ]
      },
      pipelines: {
        create: {
          id: pipeline_id,
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
      }
    }
  });
  return {
    id,
    pipeline_id,
    entry_stage,
    attendant_user: attendant_user_id,
    owner_context: createUserContextFromResolvedMembership({
      workspace_id: id,
      user_id: owner_user_id,
      role: "OWNER"
    }),
    attendant_context: createUserContextFromResolvedMembership({
      workspace_id: id,
      user_id: attendant_user_id,
      role: "ATTENDANT"
    })
  };
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({
      data: { id: workspace, slug: randomUUID(), name: "Relogio" }
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
            { label: "Conclusao", position: 2, role: "CLOSING" }
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
          display_name: "Sem equipe"
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

describe.sequential("opportunity clock sweep", () => {
  it("upserts one notification per lead and type, and a second pass does not duplicate", async () => {
    const opportunity_id = await seedOpportunity({ arrived_at: minutesAgo(180) });
    const first = await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    expect(first.upserted).toBeGreaterThanOrEqual(1);

    const later = new Date(now.getTime() + 60_000);
    const second = await sweepWorkspaceOpportunityClock(clockJob(workspace), later, app);
    expect(second.upserted).toBeGreaterThanOrEqual(1);

    const rows = await seeder.notification.findMany({
      where: { workspace_id: workspace, opportunity_id, type: "FIRST_CONTACT_SLA_BREACHED" }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]?.detected_at.getTime()).toBe(now.getTime());
    expect(rows[0]?.last_detected_at.getTime()).toBe(later.getTime());
    expect(rows[0]?.resolved_at).toBeNull();
  });

  it("resolves when the cause ends and does not require the notice to have been read", async () => {
    const opportunity_id = await seedOpportunity({ arrived_at: minutesAgo(180) });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    await seeder.opportunity.update({
      where: { id: opportunity_id },
      data: { first_contact_at: now }
    });
    const result = await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    const row = await seeder.notification.findFirst({
      where: { workspace_id: workspace, opportunity_id, type: "FIRST_CONTACT_SLA_BREACHED" }
    });
    expect(row?.resolved_at?.getTime()).toBe(now.getTime());
    expect(row?.read_at).toBeNull();
  });

  it("reevaluates open leads on the next pass after the SLA configuration changes", async () => {
    const opportunity_id = await seedOpportunity({ arrived_at: minutesAgo(40) });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    expect(
      await seeder.notification.count({
        where: {
          workspace_id: workspace,
          opportunity_id,
          type: "FIRST_CONTACT_SLA_BREACHED",
          resolved_at: null
        }
      })
    ).toBe(0);

    await seeder.workspaceSettings.upsert({
      where: { workspace_id: workspace },
      create: { workspace_id: workspace, first_contact_sla_minutes: 15, stagnation_days: 7 },
      update: { first_contact_sla_minutes: 15 }
    });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    expect(
      await seeder.notification.count({
        where: {
          workspace_id: workspace,
          opportunity_id,
          type: "FIRST_CONTACT_SLA_BREACHED",
          resolved_at: null
        }
      })
    ).toBe(1);
    await seeder.workspaceSettings.delete({ where: { workspace_id: workspace } });
  });

  it("does not persist an active notification for a merged opportunity", async () => {
    const canonical = await seedOpportunity({ arrived_at: minutesAgo(10) });
    const merged = await seedOpportunity({
      arrived_at: daysAgo(9),
      merged_into_opportunity_id: canonical
    });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    expect(
      await seeder.notification.count({
        where: { workspace_id: workspace, opportunity_id: merged, resolved_at: null }
      })
    ).toBe(0);
  });

  it("discovers the overdue tenant and not a neighbour that is still inside the clocks", async () => {
    const quiet = randomUUID();
    const quiet_pipeline = randomUUID();
    const quiet_stage = randomUUID();
    const quiet_owner = randomUUID();
    await seeder.workspace.create({
      data: {
        id: quiet,
        slug: randomUUID(),
        name: "Quiet",
        members: { create: { user_id: quiet_owner, role: "OWNER", display_name: "Quiet" } },
        pipelines: {
          create: {
            id: quiet_pipeline,
            name: "Comercial",
            type: "COMMERCIAL",
            is_default: true,
            stages: {
              create: [
                { id: quiet_stage, label: "Novo lead", position: 1, role: "ENTRY" },
                { label: "Conclusao", position: 2, role: "CLOSING" }
              ]
            }
          }
        }
      }
    });
    await seedOpportunity({ arrived_at: minutesAgo(180) });
    await seedOpportunity({
      workspace_id: quiet,
      pipeline_id: quiet_pipeline,
      stage_id: quiet_stage,
      assigned_user_id: quiet_owner,
      arrived_at: minutesAgo(10)
    });
    try {
      const claimed = await claimWorkspacesWithOverdueOpportunities(now, app);
      const ids = claimed.map((row) => row.workspace_id);
      expect(ids).toContain(workspace);
      expect(ids).not.toContain(quiet);
    } finally {
      await seeder.workspace.delete({ where: { id: quiet } });
    }
  });

  it("never writes a neighbour workspace's notification from this tenant's job", async () => {
    const neighbour_lead = await seedOpportunity({
      workspace_id: neighbour_workspace,
      assigned_user_id: neighbour_manager,
      arrived_at: minutesAgo(180)
    });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    expect(
      await seeder.notification.count({
        where: { workspace_id: neighbour_workspace, opportunity_id: neighbour_lead }
      })
    ).toBe(0);
  });
});

describe.sequential("stagnation clock sweep", () => {
  it("claims a tenant only because a contacted lead is stagnant, and a second pass updates last_detected_at", async () => {
    const stagnant = await seedIsolatedTenant("Parado");
    const fresh = await seedIsolatedTenant("Em movimento");
    try {
      await updateWorkspaceSettings(
        stagnant.owner_context,
        {
          first_contact_sla_minutes: MAX_FIRST_CONTACT_SLA_MINUTES,
          stagnation_days: 7
        },
        app
      );
      await updateWorkspaceSettings(
        fresh.owner_context,
        {
          first_contact_sla_minutes: MAX_FIRST_CONTACT_SLA_MINUTES,
          stagnation_days: 7
        },
        app
      );

      const stagnant_lead = await seedOpportunity({
        workspace_id: stagnant.id,
        pipeline_id: stagnant.pipeline_id,
        stage_id: stagnant.entry_stage,
        assigned_user_id: stagnant.attendant_user,
        arrived_at: daysAgo(7),
        first_contact_at: new Date(daysAgo(7).getTime() + 10 * 60_000),
        last_movement_at: daysAgo(7)
      });
      await seedOpportunity({
        workspace_id: fresh.id,
        pipeline_id: fresh.pipeline_id,
        stage_id: fresh.entry_stage,
        assigned_user_id: fresh.attendant_user,
        arrived_at: minutesAgo(10),
        first_contact_at: minutesAgo(5),
        last_movement_at: minutesAgo(5)
      });

      const claimed = await claimWorkspacesWithOverdueOpportunities(now, app);
      const ids = claimed.map((row) => row.workspace_id);
      expect(ids).toContain(stagnant.id);
      expect(ids).not.toContain(fresh.id);

      const first = await sweepWorkspaceOpportunityClock(clockJob(stagnant.id), now, app);
      expect(first.upserted).toBe(1);
      const later = new Date(now.getTime() + 60_000);
      const second = await sweepWorkspaceOpportunityClock(clockJob(stagnant.id), later, app);
      expect(second.upserted).toBe(1);

      const rows = await seeder.notification.findMany({
        where: { workspace_id: stagnant.id, opportunity_id: stagnant_lead }
      });
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        type: "STAGNANT",
        resolved_at: null
      });
      expect(rows[0]?.detected_at.getTime()).toBe(now.getTime());
      expect(rows[0]?.last_detected_at.getTime()).toBe(later.getTime());
    } finally {
      await seeder.workspace.deleteMany({ where: { id: { in: [stagnant.id, fresh.id] } } });
    }
  });

  it("resolves STAGNANT on the next pass after canonical movement, without a read", async () => {
    const tenant = await seedIsolatedTenant("Movimento");
    try {
      await updateWorkspaceSettings(
        tenant.owner_context,
        {
          first_contact_sla_minutes: MAX_FIRST_CONTACT_SLA_MINUTES,
          stagnation_days: 7
        },
        app
      );
      const opportunity_id = await seedOpportunity({
        workspace_id: tenant.id,
        pipeline_id: tenant.pipeline_id,
        stage_id: tenant.entry_stage,
        assigned_user_id: tenant.attendant_user,
        arrived_at: daysAgo(7),
        first_contact_at: new Date(daysAgo(7).getTime() + 10 * 60_000),
        last_movement_at: daysAgo(7)
      });
      await sweepWorkspaceOpportunityClock(clockJob(tenant.id), now, app);
      await createActivity(
        tenant.attendant_context,
        {
          opportunity_id,
          type: "TASK",
          title: "Retomar conversa",
          due_at: now
        },
        app
      );

      const result = await sweepWorkspaceOpportunityClock(clockJob(tenant.id), now, app);
      expect(result.resolved).toBe(1);
      const row = await seeder.notification.findFirstOrThrow({
        where: { workspace_id: tenant.id, opportunity_id, type: "STAGNANT" }
      });
      expect(row.resolved_at?.getTime()).toBe(now.getTime());
      expect(row.read_at).toBeNull();
    } finally {
      await seeder.workspace.delete({ where: { id: tenant.id } });
    }
  });
});

describe.sequential("resolution when the cause ends", () => {
  it.each(["WON", "LOST"] as const)(
    "resolves after the lead is %s even when the notice was already read",
    async (status) => {
      const opportunity_id = await seedOpportunity({
        arrived_at: daysAgo(7),
        first_contact_at: new Date(daysAgo(7).getTime() + 10 * 60_000),
        last_movement_at: daysAgo(7)
      });
      await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
      const notice = await seeder.notification.findFirstOrThrow({
        where: { workspace_id: workspace, opportunity_id, type: "STAGNANT" }
      });
      await markNotificationRead(manager_context, { notification_id: notice.id, now }, app);

      await seeder.opportunity.update({
        where: { id: opportunity_id },
        data: { status, closed_at: now }
      });
      const later = new Date(now.getTime() + 1_000);
      const result = await sweepWorkspaceOpportunityClock(clockJob(workspace), later, app);
      expect(result.resolved).toBeGreaterThanOrEqual(1);

      const row = await seeder.notification.findFirstOrThrow({ where: { id: notice.id } });
      expect(row.read_at?.getTime()).toBe(now.getTime());
      expect(row.read_by_user_id).toBe(manager_user);
      expect(row.resolved_at?.getTime()).toBe(later.getTime());
    }
  );

  it("resolves the tombstone after a same-financing merge, without clearing a prior read", async () => {
    const person = await seeder.person.create({
      data: { workspace_id: workspace, name: "Duplicado" }
    });
    const canonical = await seeder.opportunity.create({
      data: {
        workspace_id: workspace,
        person_id: person.id,
        pipeline_id: pipeline,
        stage_id: entry_stage,
        area: "COMMERCIAL",
        status: "OPEN",
        arrived_at: daysAgo(10),
        first_contact_at: new Date(daysAgo(10).getTime() + 10 * 60_000),
        last_movement_at: daysAgo(10),
        assigned_user_id: attendant_user
      }
    });
    const absorbed = await seeder.opportunity.create({
      data: {
        workspace_id: workspace,
        person_id: person.id,
        pipeline_id: pipeline,
        stage_id: entry_stage,
        area: "COMMERCIAL",
        status: "OPEN",
        arrived_at: daysAgo(7),
        first_contact_at: new Date(daysAgo(7).getTime() + 10 * 60_000),
        last_movement_at: daysAgo(7),
        assigned_user_id: attendant_user
      }
    });
    const review = await seeder.intakeReview.create({
      data: {
        workspace_id: workspace,
        opportunity_id: absorbed.id,
        type: "POSSIBLE_DUPLICATE",
        related_opportunity_id: canonical.id
      }
    });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    const notice = await seeder.notification.findFirstOrThrow({
      where: { opportunity_id: absorbed.id, type: "STAGNANT" }
    });
    await markNotificationRead(manager_context, { notification_id: notice.id, now }, app);

    await resolveIntakeReview(
      owner_context,
      {
        review_id: review.id,
        resolution: "SAME_FINANCING",
        reason: "E a mesma operacao de credito",
        resolved_at: now
      },
      app
    );
    expect(
      (await seeder.opportunity.findUniqueOrThrow({ where: { id: absorbed.id } }))
        .merged_into_opportunity_id
    ).toBe(canonical.id);

    const later = new Date(now.getTime() + 1_000);
    const result = await sweepWorkspaceOpportunityClock(clockJob(workspace), later, app);
    expect(result.resolved).toBeGreaterThanOrEqual(1);
    const row = await seeder.notification.findFirstOrThrow({ where: { id: notice.id } });
    expect(row.read_at?.getTime()).toBe(now.getTime());
    expect(row.resolved_at?.getTime()).toBe(later.getTime());
  });
});

describe.sequential("markNotificationRead", () => {
  it("records who marked and does not resolve", async () => {
    const opportunity_id = await seedOpportunity({ arrived_at: minutesAgo(180) });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    const notice = await seeder.notification.findFirstOrThrow({
      where: { workspace_id: workspace, opportunity_id, type: "FIRST_CONTACT_SLA_BREACHED" }
    });

    const marked = await markNotificationRead(
      manager_context,
      { notification_id: notice.id, now },
      app
    );
    expect(marked.read_at.getTime()).toBe(now.getTime());
    expect(marked.read_by_user_id).toBe(manager_user);
    expect(marked.resolved_at).toBeNull();

    const owner_marked = await markNotificationRead(
      owner_context,
      { notification_id: notice.id, now: new Date(now.getTime() + 1_000) },
      app
    );
    expect(owner_marked.read_by_user_id).toBe(owner_user);
    expect(owner_marked.resolved_at).toBeNull();
  });

  it("refuses Atendente and hides a notice outside Supervisor team or neighbour workspace", async () => {
    const team_lead = await seedOpportunity({
      arrived_at: minutesAgo(180),
      assigned_user_id: attendant_user
    });
    const other_lead = await seedOpportunity({
      arrived_at: minutesAgo(180),
      assigned_user_id: other_team_user
    });
    const neighbour_lead = await seedOpportunity({
      workspace_id: neighbour_workspace,
      assigned_user_id: neighbour_manager,
      arrived_at: minutesAgo(180)
    });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    await sweepWorkspaceOpportunityClock(clockJob(neighbour_workspace), now, app);

    const team_notice = await seeder.notification.findFirstOrThrow({
      where: { opportunity_id: team_lead, type: "FIRST_CONTACT_SLA_BREACHED" }
    });
    const other_notice = await seeder.notification.findFirstOrThrow({
      where: { opportunity_id: other_lead, type: "FIRST_CONTACT_SLA_BREACHED" }
    });
    const neighbour_notice = await seeder.notification.findFirstOrThrow({
      where: { opportunity_id: neighbour_lead, type: "FIRST_CONTACT_SLA_BREACHED" }
    });

    await expect(
      markNotificationRead(attendant_context, { notification_id: team_notice.id, now }, app)
    ).rejects.toMatchObject({ reason: "FORBIDDEN" });
    expect(
      await seeder.notification.findFirstOrThrow({ where: { id: team_notice.id } })
    ).toMatchObject({ read_at: null, resolved_at: null });

    await expect(
      markNotificationRead(supervisor_context, { notification_id: other_notice.id, now }, app)
    ).rejects.toBeInstanceOf(NotificationError);

    await markNotificationRead(supervisor_context, { notification_id: team_notice.id, now }, app);

    await expect(
      markNotificationRead(neighbour_context, { notification_id: team_notice.id, now }, app)
    ).rejects.toBeInstanceOf(NotificationError);
    await expect(
      markNotificationRead(manager_context, { notification_id: neighbour_notice.id, now }, app)
    ).rejects.toBeInstanceOf(NotificationError);
  });

  it("hides every notice from an untagged Supervisor instead of inheriting Gestão", async () => {
    const opportunity_id = await seedOpportunity({
      arrived_at: minutesAgo(180),
      assigned_user_id: attendant_user
    });
    await sweepWorkspaceOpportunityClock(clockJob(workspace), now, app);
    const notice = await seeder.notification.findFirstOrThrow({
      where: { opportunity_id, type: "FIRST_CONTACT_SLA_BREACHED" }
    });

    await expect(
      markNotificationRead(untagged_supervisor_context, { notification_id: notice.id, now }, app)
    ).rejects.toMatchObject({ reason: "NOT_VISIBLE" });
    expect(await seeder.notification.findFirstOrThrow({ where: { id: notice.id } })).toMatchObject({
      read_at: null,
      resolved_at: null
    });

    const marked = await markNotificationRead(
      manager_context,
      { notification_id: notice.id, now },
      app
    );
    expect(marked.read_by_user_id).toBe(manager_user);
    expect(marked.resolved_at).toBeNull();
  });
});
