import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createJobContext,
  createUserContextFromResolvedMembership
} from "../src/access-context.js";
import {
  FeatureDisabledError,
  assertWorkspaceFeatureEnabled,
  readWorkspaceFeatureFlags
} from "../src/feature-flags.js";

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
const integration_event_id = randomUUID();
const neighbour_event_id = randomUUID();

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Flags" },
        { id: neighbour_workspace, slug: randomUUID(), name: "Flags vizinhas" }
      ]
    });
    for (const workspace_id of [workspace, neighbour_workspace]) {
      await transaction.pipeline.create({
        data: {
          workspace_id,
          name: "Comercial",
          type: "COMMERCIAL",
          is_default: true,
          stages: {
            create: [
              { label: "Novo lead", position: 1, role: "ENTRY" },
              { label: "Conclusao", position: 2, role: "CLOSING" }
            ]
          }
        }
      });
    }
  });
  await seeder.workspaceFlag.create({
    data: { workspace_id: workspace, key: "auto_primeiro_contato" }
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({
    where: { id: { in: [workspace, neighbour_workspace] } }
  });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("readWorkspaceFeatureFlags", () => {
  it("uses the workspace carried by AccessContext and fails closed for absent rows", async () => {
    const context = createJobContext({ workspace_id: workspace, integration_event_id });

    await expect(readWorkspaceFeatureFlags(context, app)).resolves.toEqual({
      auto_primeiro_contato: true,
      score_cabimento_llm: false,
      resumo_handoff_llm: false
    });
  });

  it("does not reuse another tenant's resolved value in the same process", async () => {
    const neighbour = createJobContext({
      workspace_id: neighbour_workspace,
      integration_event_id: neighbour_event_id
    });

    await expect(readWorkspaceFeatureFlags(neighbour, app)).resolves.toEqual({
      auto_primeiro_contato: false,
      score_cabimento_llm: false,
      resumo_handoff_llm: false
    });
  });

  it("uses the same reader for the user variant without a second tenant argument", async () => {
    const user = createUserContextFromResolvedMembership({
      workspace_id: workspace,
      user_id: randomUUID(),
      role: "OWNER"
    });

    await expect(readWorkspaceFeatureFlags(user, app)).resolves.toMatchObject({
      auto_primeiro_contato: true
    });
  });
});

describe("assertWorkspaceFeatureEnabled", () => {
  it("is a server guard that rejects a disabled paid capability", async () => {
    const context = createJobContext({ workspace_id: workspace, integration_event_id });

    await expect(
      assertWorkspaceFeatureEnabled(context, "score_cabimento_llm", app)
    ).rejects.toBeInstanceOf(FeatureDisabledError);
    await expect(
      assertWorkspaceFeatureEnabled(context, "auto_primeiro_contato", app)
    ).resolves.toBeUndefined();
  });
});
