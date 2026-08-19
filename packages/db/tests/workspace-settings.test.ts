import { randomUUID } from "node:crypto";
import {
  DEFAULT_FIRST_CONTACT_SLA_MINUTES,
  DEFAULT_FIRST_CONTACT_TEMPLATE_BODY,
  DEFAULT_STAGNATION_DAYS,
  MAX_FIRST_CONTACT_SLA_MINUTES,
  MAX_STAGNATION_DAYS
} from "@marctco/domain";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import {
  getWorkspaceSettings,
  updateWorkspaceSettings,
  WorkspaceSettingsWriteError
} from "../src/workspace-settings.js";

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
const owner_user = randomUUID();
const manager_user = randomUUID();
const supervisor_user = randomUUID();
const attendant_user = randomUUID();
const neighbour_owner = randomUUID();

const owner_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: owner_user,
  role: "OWNER"
});
const manager_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const supervisor_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: supervisor_user,
  role: "SUPERVISOR"
});
const attendant_context = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: attendant_user,
  role: "ATTENDANT"
});
const neighbour_context = createUserContextFromResolvedMembership({
  workspace_id: neighbour_workspace,
  user_id: neighbour_owner,
  role: "OWNER"
});

async function seedWorkspace(id: string, owner_id: string, name: string): Promise<void> {
  await seeder.workspace.create({
    data: {
      id,
      slug: randomUUID(),
      name,
      members: {
        create: { user_id: owner_id, role: "OWNER", display_name: "Direção", email: `${id}@hugs.test` }
      },
      pipelines: {
        create: {
          name: "Comercial",
          type: "COMMERCIAL",
          is_default: true,
          stages: {
            create: [
              { label: "Entrada", position: 1, role: "ENTRY" },
              { label: "Conclusão", position: 2, role: "CLOSING" }
            ]
          }
        }
      }
    }
  });
}

beforeAll(async () => {
  await seedWorkspace(workspace, owner_user, "Clocks");
  await seedWorkspace(neighbour_workspace, neighbour_owner, "Neighbour clocks");
  await seeder.workspaceMember.createMany({
    data: [
      {
        workspace_id: workspace,
        user_id: manager_user,
        role: "MANAGER",
        display_name: "Gestão",
        email: "gestao@hugs.test"
      },
      {
        workspace_id: workspace,
        user_id: supervisor_user,
        role: "SUPERVISOR",
        display_name: "Supervisor",
        email: "sup@hugs.test"
      },
      {
        workspace_id: workspace,
        user_id: attendant_user,
        role: "ATTENDANT",
        display_name: "Atendente",
        email: "at@hugs.test"
      }
    ]
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({
    where: { id: { in: [workspace, neighbour_workspace] } }
  });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

const firstContactDefaults = {
  first_contact_trigger: "ON_ASSIGNMENT",
  first_contact_template_body: DEFAULT_FIRST_CONTACT_TEMPLATE_BODY
} as const;

describe("getWorkspaceSettings", () => {
  it("returns the domain defaults when the workspace has no row", async () => {
    await expect(getWorkspaceSettings(owner_context, app)).resolves.toEqual({
      first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
      stagnation_days: DEFAULT_STAGNATION_DAYS,
      ...firstContactDefaults
    });
  });

  it("lets every profile read the resolved clocks", async () => {
    for (const context of [attendant_context, supervisor_context, manager_context, owner_context]) {
      await expect(getWorkspaceSettings(context, app)).resolves.toEqual({
        first_contact_sla_minutes: DEFAULT_FIRST_CONTACT_SLA_MINUTES,
        stagnation_days: DEFAULT_STAGNATION_DAYS,
        ...firstContactDefaults
      });
    }
  });
});

describe("updateWorkspaceSettings", () => {
  it("lets Gestão and Direção write, and refuses Atendente and Supervisor at the operation", async () => {
    await expect(
      updateWorkspaceSettings(manager_context, { first_contact_sla_minutes: 20 }, app)
    ).resolves.toEqual({
      first_contact_sla_minutes: 20,
      stagnation_days: DEFAULT_STAGNATION_DAYS,
      ...firstContactDefaults
    });

    await expect(
      updateWorkspaceSettings(owner_context, { stagnation_days: 11 }, app)
    ).resolves.toEqual({
      first_contact_sla_minutes: 20,
      stagnation_days: 11,
      ...firstContactDefaults
    });

    await expect(
      updateWorkspaceSettings(attendant_context, { first_contact_sla_minutes: 5 }, app)
    ).rejects.toBeInstanceOf(WorkspaceSettingsWriteError);
    await expect(
      updateWorkspaceSettings(attendant_context, { first_contact_sla_minutes: 5 }, app)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      updateWorkspaceSettings(supervisor_context, { stagnation_days: 2 }, app)
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(getWorkspaceSettings(attendant_context, app)).resolves.toEqual({
      first_contact_sla_minutes: 20,
      stagnation_days: 11,
      ...firstContactDefaults
    });
  });

  it("keeps the other clock on a partial override", async () => {
    await updateWorkspaceSettings(
      manager_context,
      { first_contact_sla_minutes: 40, stagnation_days: 8 },
      app
    );
    await expect(
      updateWorkspaceSettings(manager_context, { first_contact_sla_minutes: 25 }, app)
    ).resolves.toEqual({
      first_contact_sla_minutes: 25,
      stagnation_days: 8,
      ...firstContactDefaults
    });
  });

  it("refuses zero, negative and out-of-range values on write", async () => {
    for (const input of [
      { first_contact_sla_minutes: 0 },
      { first_contact_sla_minutes: -3 },
      { first_contact_sla_minutes: MAX_FIRST_CONTACT_SLA_MINUTES + 1 },
      { stagnation_days: 0 },
      { stagnation_days: -1 },
      { stagnation_days: MAX_STAGNATION_DAYS + 1 }
    ]) {
      await expect(
        updateWorkspaceSettings(manager_context, input, app)
      ).rejects.toMatchObject({ code: "INVALID" });
    }
    await expect(getWorkspaceSettings(manager_context, app)).resolves.toEqual({
      first_contact_sla_minutes: 25,
      stagnation_days: 8,
      ...firstContactDefaults
    });
  });

  it("does not leak a neighbour workspace's stored clocks", async () => {
    await updateWorkspaceSettings(neighbour_context, { first_contact_sla_minutes: 90 }, app);
    await expect(getWorkspaceSettings(owner_context, app)).resolves.toEqual({
      first_contact_sla_minutes: 25,
      stagnation_days: 8,
      ...firstContactDefaults
    });
    await expect(getWorkspaceSettings(neighbour_context, app)).resolves.toEqual({
      first_contact_sla_minutes: 90,
      stagnation_days: DEFAULT_STAGNATION_DAYS,
      ...firstContactDefaults
    });
  });

  it("does not create a row until the first accepted write", async () => {
    const fresh = randomUUID();
    const fresh_owner = randomUUID();
    await seedWorkspace(fresh, fresh_owner, "No clocks yet");
    const count = await seeder.workspaceSettings.count({ where: { workspace_id: fresh } });
    expect(count).toBe(0);
    await seeder.workspace.delete({ where: { id: fresh } });
  });

  it("lets Gestão write the first-contact trigger and template, and refuses a neighbour's write", async () => {
    const arrival_body = "Olá {{lead_name}}, aqui é a {{workspace_name}}.";
    await expect(
      updateWorkspaceSettings(
        manager_context,
        {
          first_contact_trigger: "ON_ARRIVAL",
          first_contact_template_body: arrival_body
        },
        app
      )
    ).resolves.toEqual({
      first_contact_sla_minutes: 25,
      stagnation_days: 8,
      first_contact_trigger: "ON_ARRIVAL",
      first_contact_template_body: arrival_body
    });

    await expect(
      updateWorkspaceSettings(
        attendant_context,
        {
          first_contact_trigger: "DISABLED",
          first_contact_template_body: ""
        },
        app
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    await expect(
      updateWorkspaceSettings(
        manager_context,
        {
          first_contact_trigger: "ON_ARRIVAL",
          first_contact_template_body: "Olá {{attendant_name}}"
        },
        app
      )
    ).rejects.toMatchObject({ code: "INVALID" });

    await expect(
      updateWorkspaceSettings(
        manager_context,
        { first_contact_trigger: "ON_ASSIGNMENT", first_contact_template_body: "" },
        app
      )
    ).rejects.toMatchObject({ code: "INVALID" });

    await updateWorkspaceSettings(
      neighbour_context,
      {
        first_contact_trigger: "DISABLED",
        first_contact_template_body: ""
      },
      app
    );
    await expect(getWorkspaceSettings(owner_context, app)).resolves.toEqual({
      first_contact_sla_minutes: 25,
      stagnation_days: 8,
      first_contact_trigger: "ON_ARRIVAL",
      first_contact_template_body: arrival_body
    });
    await expect(getWorkspaceSettings(neighbour_context, app)).resolves.toEqual({
      first_contact_sla_minutes: 90,
      stagnation_days: DEFAULT_STAGNATION_DAYS,
      first_contact_trigger: "DISABLED",
      first_contact_template_body: ""
    });
  });
});

describe("workspace_settings CHECKs", () => {
  it("rejects a non-positive interval at the database", async () => {
    const isolated = randomUUID();
    const isolated_owner = randomUUID();
    await seedWorkspace(isolated, isolated_owner, "Check clocks");
    try {
      await expect(
        seeder.$executeRaw`
          INSERT INTO workspace_settings (
            workspace_id, first_contact_sla_minutes, stagnation_days, updated_at
          ) VALUES (${isolated}::uuid, 0, 3, CURRENT_TIMESTAMP)
        `
      ).rejects.toThrow(/workspace_settings_first_contact_sla_minutes_positive/);
    } finally {
      await seeder.workspace.delete({ where: { id: isolated } });
    }
  });
});
