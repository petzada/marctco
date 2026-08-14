import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { attachWorkspaceMember, listTeam } from "../src/team.js";
import { listUserWorkspaces, resolveUserContextForSlug } from "../src/workspace-context.js";

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
const workspace_slug = randomUUID();
const neighbour_slug = randomUUID();
const owner_user = randomUUID();
const manager_user = randomUUID();
const supervisor_user = randomUUID();
const attendant_user = randomUUID();
const collaborator_user = randomUUID();
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

async function seedWorkspace(id: string, slug: string, owner_id: string, name: string): Promise<void> {
  await seeder.workspace.create({
    data: {
      id,
      slug,
      name,
      members: {
        create: { user_id: owner_id, role: "OWNER", display_name: "Direção", email: "dir@hugs.test" }
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
  await seedWorkspace(workspace, workspace_slug, owner_user, "Hugs");
  await seedWorkspace(neighbour_workspace, neighbour_slug, neighbour_owner, "Outro dono");
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
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, neighbour_workspace] } } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("Equipe named operations", () => {
  it("attaches an already-resolved user_id as ACTIVE with role, tags and optional phone", async () => {
    const attached = await attachWorkspaceMember(
      owner_context,
      {
        user_id: collaborator_user,
        display_name: " Ana ACR ",
        email: "Ana@Hugs.test",
        role: "ATTENDANT",
        tags: ["ACR", "Manhã"],
        whatsapp_phone: "(11) 98765-4321"
      },
      app
    );

    expect(attached).toEqual({
      user_id: collaborator_user,
      role: "ATTENDANT",
      status: "ACTIVE",
      display_name: "Ana ACR",
      email: "ana@hugs.test",
      whatsapp_phone_e164: "+5511987654321",
      tags: ["ACR", "Manhã"]
    });

    const team = await listTeam(owner_context, app);
    const member = team.find((row) => row.user_id === collaborator_user);
    expect(member).toMatchObject({
      user_id: collaborator_user,
      role: "ATTENDANT",
      status: "ACTIVE",
      display_name: "Ana ACR",
      email: "ana@hugs.test",
      whatsapp_phone_e164: "+5511987654321"
    });
    expect(member?.tags).toEqual(["ACR", "Manhã"]);
  });

  it("creates a missing tag and applies several tags in the same attach", async () => {
    const user_id = randomUUID();
    await attachWorkspaceMember(
      owner_context,
      {
        user_id: randomUUID(),
        display_name: "Primeira ACR",
        email: "primeira.acr@hugs.test",
        role: "ATTENDANT",
        tags: ["ACR"]
      },
      app
    );
    const attached = await attachWorkspaceMember(
      owner_context,
      {
        user_id,
        display_name: "Duas tags",
        email: "duas@hugs.test",
        role: "SUPERVISOR",
        tags: ["REAL", "acr"]
      },
      app
    );
    expect(attached.tags).toEqual(["REAL", "ACR"]);

    const matching = await seeder.$queryRaw<Array<{ name: string }>>`
      SELECT name FROM tags
      WHERE workspace_id = ${workspace}::uuid
        AND lower(name) = 'acr'
    `;
    expect(matching).toHaveLength(1);
    expect(matching[0]?.name).toBe("ACR");
  });

  it("reuses one case-insensitive tag when two cadastros create it concurrently", async () => {
    const tag_name = `Concorrente-${randomUUID()}`;
    const users = [randomUUID(), randomUUID()];

    const attached = await Promise.all(
      users.map((user_id, index) =>
        attachWorkspaceMember(
          owner_context,
          {
            user_id,
            display_name: `Concorrente ${index + 1}`,
            email: `concorrente.${index + 1}.${user_id}@hugs.test`,
            role: "ATTENDANT",
            tags: [index === 0 ? tag_name : tag_name.toUpperCase()]
          },
          app
        )
      )
    );

    expect(attached.map((member) => member.tags)).toEqual([[tag_name], [tag_name]]);
    await expect(
      seeder.tag.count({
        where: { workspace_id: workspace, name: { equals: tag_name, mode: "insensitive" } }
      })
    ).resolves.toBe(1);
  });

  it("rejects a second tag that differs only by case", async () => {
    await seeder.tag.create({
      data: { workspace_id: workspace, name: "Piloto" }
    });
    await expect(
      seeder.tag.create({
        data: { workspace_id: workspace, name: "piloto" }
      })
    ).rejects.toThrow(/unique/i);
  });

  it("reactivates a DETACHED membership instead of inserting a second row", async () => {
    const user_id = randomUUID();
    await attachWorkspaceMember(
      owner_context,
      {
        user_id,
        display_name: "Volta",
        email: "volta@hugs.test",
        role: "ATTENDANT",
        tags: ["Manhã"]
      },
      app
    );
    await seeder.workspaceMember.update({
      where: { workspace_id_user_id: { workspace_id: workspace, user_id } },
      data: { status: "DETACHED" }
    });

    const reattached = await attachWorkspaceMember(
      owner_context,
      {
        user_id,
        display_name: "Volta de novo",
        email: "volta.de.novo@hugs.test",
        role: "SUPERVISOR",
        tags: ["REAL"]
      },
      app
    );
    expect(reattached).toMatchObject({
      user_id,
      role: "SUPERVISOR",
      status: "ACTIVE",
      display_name: "Volta de novo",
      tags: ["REAL"]
    });

    const rows = await seeder.workspaceMember.findMany({
      where: { workspace_id: workspace, user_id }
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ role: "SUPERVISOR", status: "ACTIVE" });
  });

  it("never writes OWNER and never grants the right to provision", async () => {
    await expect(
      attachWorkspaceMember(
        owner_context,
        {
          user_id: randomUUID(),
          display_name: "Falso dono",
          email: "falso@hugs.test",
          role: "OWNER" as "ATTENDANT",
          tags: []
        },
        app
      )
    ).rejects.toThrow(/cannot create an OWNER/i);

    await expect(
      attachWorkspaceMember(
        owner_context,
        {
          user_id: owner_user,
          display_name: "Direção",
          email: "dir@hugs.test",
          role: "MANAGER",
          tags: []
        },
        app
      )
    ).rejects.toThrow(/cannot create an OWNER/i);

    const owner = await seeder.workspaceMember.findUnique({
      where: { workspace_id_user_id: { workspace_id: workspace, user_id: owner_user } }
    });
    expect(owner?.role).toBe("OWNER");
  });

  it("refuses cadastro from anyone but OWNER", async () => {
    await expect(
      attachWorkspaceMember(
        manager_context,
        {
          user_id: randomUUID(),
          display_name: "Gestão tenta",
          email: "nao@hugs.test",
          role: "ATTENDANT",
          tags: []
        },
        app
      )
    ).rejects.toThrow(/only owner/i);
  });

  it("lists the whole roster for Supervisor in this ticket, and refuses Atendente", async () => {
    const as_supervisor = await listTeam(supervisor_context, app);
    const as_manager = await listTeam(manager_context, app);
    expect(as_supervisor.map((row) => row.user_id).sort()).toEqual(
      as_manager.map((row) => row.user_id).sort()
    );
    expect(as_supervisor.some((row) => row.role === "OWNER")).toBe(true);
    expect(as_supervisor.every((row) => row.status === "ACTIVE")).toBe(true);

    await expect(listTeam(attendant_context, app)).rejects.toThrow(/cannot list the team/i);
  });

  it("omits DETACHED from listUserWorkspaces and from Equipe", async () => {
    const user_id = randomUUID();
    await attachWorkspaceMember(
      owner_context,
      {
        user_id,
        display_name: "Sai",
        email: "sai@hugs.test",
        role: "ATTENDANT",
        tags: []
      },
      app
    );
    await seeder.workspaceMember.update({
      where: { workspace_id_user_id: { workspace_id: workspace, user_id } },
      data: { status: "DETACHED" }
    });

    const choices = await listUserWorkspaces({ authenticated_user_id: user_id }, seeder);
    expect(choices).toEqual([]);
    expect(await resolveUserContextForSlug(user_id, workspace_slug, seeder)).toBeNull();

    const team = await listTeam(owner_context, app);
    expect(team.some((row) => row.user_id === user_id)).toBe(false);
  });

  it("fills display_name and email of a pre-existing OWNER from auth.users", async () => {
    const legacy_owner = randomUUID();
    const legacy_workspace = randomUUID();
    await seedWorkspace(legacy_workspace, randomUUID(), legacy_owner, "Legacy");
    await seeder.workspaceMember.update({
      where: { workspace_id_user_id: { workspace_id: legacy_workspace, user_id: legacy_owner } },
      data: { display_name: null, email: null }
    });

    await seeder.$executeRawUnsafe("CREATE SCHEMA IF NOT EXISTS auth");
    await seeder.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS auth.users (
        id UUID PRIMARY KEY,
        email TEXT,
        raw_user_meta_data JSONB NOT NULL DEFAULT '{}'::jsonb
      )
    `);
    await seeder.$executeRaw`
      INSERT INTO auth.users (id, email, raw_user_meta_data)
      VALUES (
        ${legacy_owner}::uuid,
        'hugs.owner@example.com',
        '{"full_name":"Direção Hugs"}'::jsonb
      )
      ON CONFLICT (id) DO UPDATE
        SET email = EXCLUDED.email,
            raw_user_meta_data = EXCLUDED.raw_user_meta_data
    `;
    await seeder.$executeRaw`
      UPDATE public.workspace_members AS member
      SET
        display_name = COALESCE(
          NULLIF(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
          NULLIF(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
          NULLIF(btrim(auth_user.email), ''),
          member.display_name
        ),
        email = COALESCE(NULLIF(lower(btrim(auth_user.email)), ''), member.email)
      FROM auth.users AS auth_user
      WHERE auth_user.id = member.user_id
        AND member.workspace_id = ${legacy_workspace}::uuid
    `;

    const legacy_owner_context = createUserContextFromResolvedMembership({
      workspace_id: legacy_workspace,
      user_id: legacy_owner,
      role: "OWNER"
    });
    const team = await listTeam(legacy_owner_context, app);
    expect(team).toEqual([
      expect.objectContaining({
        user_id: legacy_owner,
        display_name: "Direção Hugs",
        email: "hugs.owner@example.com",
        role: "OWNER",
        status: "ACTIVE",
        tags: []
      })
    ]);

    await seeder.workspace.delete({ where: { id: legacy_workspace } });
    await seeder.$executeRaw`DELETE FROM auth.users WHERE id = ${legacy_owner}::uuid`;
  });
});
