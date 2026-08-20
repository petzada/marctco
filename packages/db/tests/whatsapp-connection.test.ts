import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createUserContextFromResolvedMembership,
  type UserContext
} from "../src/access-context.js";
import { hashIntegrationToken } from "../src/integration-connection.js";
import {
  WhatsAppConnectionError,
  commitWhatsAppWebhookSecret,
  createWhatsAppConnection,
  getLeadWhatsAppConnectionIndicator,
  getWhatsAppConnection,
  setWhatsAppPairingState
} from "../src/whatsapp-connection.js";

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
const other_workspace = randomUUID();
const owner_user = randomUUID();
const manager_user = randomUUID();
const attendant_user = randomUUID();
const supervisor_user = randomUUID();

const owner_context: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: owner_user,
  role: "OWNER"
});
const manager_context: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});
const attendant_context: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: attendant_user,
  role: "ATTENDANT"
});
const supervisor_context: UserContext = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: supervisor_user,
  role: "SUPERVISOR"
});

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "WhatsApp" },
        { id: other_workspace, slug: randomUUID(), name: "Outro" }
      ]
    });
    for (const workspace_id of [workspace, other_workspace]) {
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
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, other_workspace] } } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("getWhatsAppConnection", () => {
  it("is Gestão and Direção, never Atendente or Supervisor", async () => {
    await expect(getWhatsAppConnection(attendant_context, app)).rejects.toBeInstanceOf(
      WhatsAppConnectionError
    );
    await expect(getWhatsAppConnection(supervisor_context, app)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    await expect(getWhatsAppConnection(manager_context, app)).resolves.toBeNull();
    await expect(getWhatsAppConnection(owner_context, app)).resolves.toBeNull();
  });
});

describe("createWhatsAppConnection", () => {
  it("is OWNER only and persists instanceName plus a webhook hash, never returning the hash", async () => {
    await expect(createWhatsAppConnection(manager_context, app)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });

    const created = await createWhatsAppConnection(owner_context, app);
    expect(created.created).toBe(true);
    expect(created.webhook_token).toMatch(/^mtco_/);
    expect(created.instance_name).toBe(`marctco_${workspace.replaceAll("-", "")}`);
    expect(created.status).toBe("ACTIVE");
    expect(created.pairing_state).toBe("DISCONNECTED");
    expect(created).not.toHaveProperty("token_hash");
    expect(created).not.toHaveProperty("token_last4");

    const stored = await seeder.integrationConnection.findUniqueOrThrow({
      where: { id: created.integration_connection_id }
    });
    expect(stored.provider).toBe("WHATSMIAU");
    expect(stored.instance_name).toBe(created.instance_name);
    expect(stored.pairing_state).toBe("DISCONNECTED");
    expect(stored.token_hash).toBe(hashIntegrationToken(created.webhook_token as string));
  });

  it("reuses the existing row without minting a second token", async () => {
    const first = await getWhatsAppConnection(owner_context, app);
    const second = await createWhatsAppConnection(owner_context, app);
    expect(first).not.toBeNull();
    expect(second.created).toBe(false);
    expect(second.webhook_token).toBeNull();
    expect(second.integration_connection_id).toBe(first?.integration_connection_id);
    expect(second.instance_name).toBe(first?.instance_name);
  });
});

describe("getWhatsAppConnection after create", () => {
  it("returns administrative status and pairing state without secret material", async () => {
    const view = await getWhatsAppConnection(manager_context, app);
    expect(view).toMatchObject({
      instance_name: `marctco_${workspace.replaceAll("-", "")}`,
      status: "ACTIVE",
      pairing_state: "DISCONNECTED"
    });
    expect(view && Object.keys(view).sort()).toEqual(
      [
        "created_at",
        "instance_name",
        "integration_connection_id",
        "pairing_state",
        "status",
        "updated_at"
      ].sort()
    );
  });
});

describe("setWhatsAppPairingState", () => {
  it("lets Gestão and Direção cache the provider reading, not Atendente", async () => {
    await expect(setWhatsAppPairingState(attendant_context, "CONNECTED", app)).rejects.toMatchObject(
      { code: "FORBIDDEN" }
    );
    await setWhatsAppPairingState(manager_context, "QR_PENDING", app);
    await expect(getWhatsAppConnection(owner_context, app)).resolves.toMatchObject({
      pairing_state: "QR_PENDING",
      status: "ACTIVE"
    });
    await setWhatsAppPairingState(owner_context, "CONNECTED", app);
    await expect(getWhatsAppConnection(manager_context, app)).resolves.toMatchObject({
      pairing_state: "CONNECTED"
    });
  });
});

describe("commitWhatsAppWebhookSecret", () => {
  it("is OWNER only and replaces the stored hash without exposing it", async () => {
    const before = await seeder.integrationConnection.findFirstOrThrow({
      where: { workspace_id: workspace, provider: "WHATSMIAU" }
    });
    await expect(
      commitWhatsAppWebhookSecret(
        manager_context,
        { token_hash: "a".repeat(64), token_last4: "zzzz" },
        app
      )
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const token_hash = "b".repeat(64);
    await commitWhatsAppWebhookSecret(owner_context, { token_hash, token_last4: "xyzw" }, app);
    const after = await seeder.integrationConnection.findUniqueOrThrow({
      where: { id: before.id }
    });
    expect(after.token_hash).toBe(token_hash);
    expect(after.token_last4).toBe("xyzw");
    await expect(getWhatsAppConnection(owner_context, app)).resolves.not.toHaveProperty(
      "token_last4"
    );
  });
});

describe("getLeadWhatsAppConnectionIndicator", () => {
  const other_attendant_user = randomUUID();
  const other_attendant_context: UserContext = createUserContextFromResolvedMembership({
    workspace_id: workspace,
    user_id: other_attendant_user,
    role: "ATTENDANT"
  });

  let mine: string;
  let colleagues: string;

  beforeAll(async () => {
    await seeder.workspaceMember.createMany({
      data: [
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
        }
      ]
    });
    const tag = await seeder.tag.create({ data: { workspace_id: workspace, name: "ACR" } });
    await seeder.memberTag.createMany({
      data: [
        { workspace_id: workspace, user_id: supervisor_user, tag_id: tag.id },
        { workspace_id: workspace, user_id: attendant_user, tag_id: tag.id }
      ]
    });
    const pipeline = await seeder.pipeline.findFirstOrThrow({ where: { workspace_id: workspace } });
    const entry = await seeder.stage.findFirstOrThrow({
      where: { pipeline_id: pipeline.id, role: "ENTRY" }
    });
    const minePerson = await seeder.person.create({
      data: { workspace_id: workspace, name: "Lead do atendente" }
    });
    const colleaguePerson = await seeder.person.create({
      data: { workspace_id: workspace, name: "Lead do colega" }
    });
    mine = (
      await seeder.opportunity.create({
        data: {
          workspace_id: workspace,
          person_id: minePerson.id,
          pipeline_id: pipeline.id,
          stage_id: entry.id,
          area: "COMMERCIAL",
          status: "OPEN",
          arrived_at: new Date("2026-08-20T09:00:00.000Z"),
          assigned_user_id: attendant_user
        }
      })
    ).id;
    colleagues = (
      await seeder.opportunity.create({
        data: {
          workspace_id: workspace,
          person_id: colleaguePerson.id,
          pipeline_id: pipeline.id,
          stage_id: entry.id,
          area: "COMMERCIAL",
          status: "OPEN",
          arrived_at: new Date("2026-08-20T09:01:00.000Z"),
          assigned_user_id: other_attendant_user
        }
      })
    ).id;
  });

  it("is a boolean on the card for every profile in lead scope, without loosening the admin read", async () => {
    await setWhatsAppPairingState(owner_context, "CONNECTED", app);

    const indicator = await getLeadWhatsAppConnectionIndicator(attendant_context, mine, app);
    expect(indicator).toEqual({ connected: true });
    expect(Object.keys(indicator)).toEqual(["connected"]);
    expect(JSON.stringify(indicator)).not.toMatch(/token|last4|apikey|instance_name|mtco_/i);

    await expect(getLeadWhatsAppConnectionIndicator(attendant_context, colleagues, app)).rejects.toThrow(
      /Lead not found/
    );
    await expect(
      getLeadWhatsAppConnectionIndicator(other_attendant_context, mine, app)
    ).rejects.toThrow(/Lead not found/);

    await expect(getLeadWhatsAppConnectionIndicator(supervisor_context, mine, app)).resolves.toEqual({
      connected: true
    });
    await expect(
      getLeadWhatsAppConnectionIndicator(supervisor_context, colleagues, app)
    ).rejects.toThrow(/Lead not found/);

    await expect(getLeadWhatsAppConnectionIndicator(manager_context, colleagues, app)).resolves.toEqual({
      connected: true
    });
    await expect(getLeadWhatsAppConnectionIndicator(owner_context, mine, app)).resolves.toEqual({
      connected: true
    });

    await expect(getWhatsAppConnection(attendant_context, app)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    await expect(getWhatsAppConnection(supervisor_context, app)).rejects.toMatchObject({
      code: "FORBIDDEN"
    });
    const admin = await getWhatsAppConnection(manager_context, app);
    expect(admin).toMatchObject({ pairing_state: "CONNECTED" });
    expect(admin).toHaveProperty("instance_name");
  });

  it("reports disconnected when pairing is not open, still without secrets", async () => {
    await setWhatsAppPairingState(manager_context, "DISCONNECTED", app);
    await expect(getLeadWhatsAppConnectionIndicator(attendant_context, mine, app)).resolves.toEqual({
      connected: false
    });
    await expect(getLeadWhatsAppConnectionIndicator(owner_context, colleagues, app)).resolves.toEqual({
      connected: false
    });
  });
});
