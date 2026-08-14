import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { detachWorkspaceMember, terminateWorkspaceMember } from "../src/team.js";
import { resolveUserContextForSlug } from "../src/workspace-context.js";

const database_url = process.env.DATABASE_URL;
if (!database_url) throw new Error("DATABASE_URL is required for database tests");

function roleUrl(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.set("options", "-c role=marctco_app");
  return parsed.toString();
}

const seeder = new PrismaClient({ datasources: { db: { url: database_url } } });
const app = new PrismaClient({ datasources: { db: { url: roleUrl(database_url) } } });
const owner = randomUUID();
const manager = randomUUID();
const target = randomUUID();
const foreignOwner = randomUUID();
const ownedA = randomUUID();
const ownedB = randomUUID();
const foreign = randomUUID();
const slugs = [randomUUID(), randomUUID(), randomUUID()];

async function seedWorkspace(id: string, slug: string, ownerId: string, targetRole: "ATTENDANT" | "OWNER" = "ATTENDANT") {
  await seeder.workspace.create({
    data: {
      id, slug, name: `Workspace ${id}`,
      members: { create: [
        { user_id: ownerId, role: "OWNER", display_name: "Direcao", email: `${ownerId}@test.local` },
        ...(ownerId === owner && targetRole !== "OWNER" ? [
          { user_id: target, role: targetRole, display_name: "Colaborador", email: "colaborador@test.local" }
        ] : ownerId === foreignOwner ? [
          { user_id: target, role: "ATTENDANT" as const, display_name: "Colaborador", email: "colaborador@test.local" }
        ] : [])
      ] },
      pipelines: { create: { name: "Comercial", type: "COMMERCIAL", is_default: true, stages: { create: [
        { label: "Entrada", position: 1, role: "ENTRY" },
        { label: "Conclusao", position: 2, role: "CLOSING" }
      ] } } }
    }
  });
}

async function seedOpportunity(workspace_id: string, status: "OPEN" | "WON" | "LOST") {
  const pipeline = await seeder.pipeline.findFirstOrThrow({ where: { workspace_id } });
  const stage = await seeder.stage.findFirstOrThrow({ where: { workspace_id } });
  const person = await seeder.person.create({ data: { workspace_id, name: status } });
  return seeder.opportunity.create({ data: {
    workspace_id, person_id: person.id, pipeline_id: pipeline.id, stage_id: stage.id,
    area: "COMMERCIAL", status, arrived_at: new Date(), assigned_user_id: target
  } });
}

beforeAll(async () => {
  await seedWorkspace(ownedA, slugs[0]!, owner);
  await seedWorkspace(ownedB, slugs[1]!, owner);
  await seedWorkspace(foreign, slugs[2]!, foreignOwner);
  await seeder.workspaceMember.create({ data: { workspace_id: ownedA, user_id: manager, role: "MANAGER" } });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [ownedA, ownedB, foreign] } } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("Equipe membership lifecycle", () => {
  it("detaches only this tenant, queues OPEN leads with their previous owner, and preserves closed leads", async () => {
    const [open, won, lost] = await Promise.all([
      seedOpportunity(ownedA, "OPEN"), seedOpportunity(ownedA, "WON"), seedOpportunity(ownedA, "LOST")
    ]);
    const context = createUserContextFromResolvedMembership({ workspace_id: ownedA, user_id: manager, role: "MANAGER" });

    await expect(detachWorkspaceMember(context, target, app)).resolves.toEqual({ detached: true, queued_open_opportunities: 1 });

    await expect(resolveUserContextForSlug(target, slugs[0]!, seeder)).resolves.toBeNull();
    await expect(resolveUserContextForSlug(target, slugs[1]!, seeder)).resolves.not.toBeNull();
    expect(await seeder.workspaceMember.findUnique({ where: { workspace_id_user_id: { workspace_id: ownedA, user_id: target } } })).toMatchObject({ status: "DETACHED" });
    expect(await seeder.opportunity.findUnique({ where: { id: open.id } })).toMatchObject({ assigned_user_id: null, previous_assigned_user_id: target });
    expect(await seeder.opportunity.findUnique({ where: { id: won.id } })).toMatchObject({ assigned_user_id: target, previous_assigned_user_id: null });
    expect(await seeder.opportunity.findUnique({ where: { id: lost.id } })).toMatchObject({ assigned_user_id: target, previous_assigned_user_id: null });
  });

  it("lets only OWNER terminate across workspaces they own and leaves another owner's tenant untouched", async () => {
    // Reactivate the first tenant after the previous tracer bullet.
    await seeder.workspaceMember.update({ where: { workspace_id_user_id: { workspace_id: ownedA, user_id: target } }, data: { status: "ACTIVE" } });
    const context = createUserContextFromResolvedMembership({ workspace_id: ownedA, user_id: owner, role: "OWNER" });
    const results = await terminateWorkspaceMember(context, target, app);
    expect(results.map((result) => result.workspace_id).sort()).toEqual([ownedA, ownedB].sort());
    expect((await seeder.workspaceMember.findUniqueOrThrow({ where: { workspace_id_user_id: { workspace_id: foreign, user_id: target } } })).status).toBe("ACTIVE");
  });

  it("refuses self-detachment, OWNER targets, Supervisor and Attendant actors", async () => {
    const ownerContext = createUserContextFromResolvedMembership({ workspace_id: ownedA, user_id: owner, role: "OWNER" });
    await expect(detachWorkspaceMember(ownerContext, owner, app)).rejects.toThrow(/self/i);
    const managerContext = createUserContextFromResolvedMembership({ workspace_id: ownedA, user_id: manager, role: "MANAGER" });
    await expect(detachWorkspaceMember(managerContext, owner, app)).rejects.toThrow(/OWNER cannot be detached/i);
    for (const role of ["SUPERVISOR", "ATTENDANT"] as const) {
      const actor = randomUUID();
      const context = createUserContextFromResolvedMembership({ workspace_id: ownedA, user_id: actor, role });
      await expect(detachWorkspaceMember(context, target, app)).rejects.toThrow(/MANAGER or OWNER/i);
    }
    await expect(terminateWorkspaceMember(managerContext, target, app)).rejects.toThrow(/Only OWNER/i);
  });
});
