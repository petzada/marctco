import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  createJobContext,
  createUserContextFromResolvedMembership,
  type UserContext
} from "../src/access-context.js";
import {
  getIntegrationConnectionSummary,
  rotateIntegrationConnectionSecret,
  setIntegrationConnectionStatus
} from "../src/integration-connection-operations.js";
import { hashIntegrationToken } from "../src/integration-connection.js";
import {
  getLastSuccessfulSyncAt,
  IntegrationEventPayloadExpiredError,
  integrationEventPayloadExpiresAt,
  requeueIntegrationEventForReprocessing
} from "../src/integration-event.js";
import { applyIntakePlan, recordLeadSubmission } from "../src/intake.js";

/**
 * The Direção-only half of the Pluga screen (ADR-0015): generate/rotate the
 * secret and enable/disable the connection, plus the Gestão-and-up read of
 * "when did this last actually work" and the "reprocessar" refusal for an
 * expired payload (ADR-0014). Against real Postgres, so the role check and
 * the RLS scoping are proven together rather than trusted separately.
 */

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
const pipeline_id = randomUUID();
const entry_stage_id = randomUUID();
const connection_id = randomUUID();
const owner_user = randomUUID();
const manager_user = randomUUID();

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

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.create({ data: { id: workspace, slug: randomUUID(), name: "Secret" } });
    await transaction.pipeline.create({
      data: {
        id: pipeline_id,
        workspace_id: workspace,
        name: "Comercial",
        type: "COMMERCIAL",
        is_default: true,
        stages: {
          create: [
            { id: entry_stage_id, label: "Novo lead", position: 1, role: "ENTRY" },
            { label: "Conclusao", position: 2, role: "CLOSING" }
          ]
        }
      }
    });
    await transaction.integrationConnection.create({
      data: {
        id: connection_id,
        workspace_id: workspace,
        provider: "PLUGA",
        token_hash: randomUUID().replaceAll("-", "").padEnd(64, "0"),
        token_last4: "aaaa"
      }
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: workspace } });
  await seeder.$disconnect();
  await app.$disconnect();
});

describe("getIntegrationConnectionSummary", () => {
  it("is OWNER only — Gestão does not see the masked secret (ADR-0015)", async () => {
    await expect(getIntegrationConnectionSummary(manager_context, "PLUGA", app)).rejects.toThrow(
      /Only OWNER/
    );
  });

  it("returns the masked material and never the hash", async () => {
    const summary = await getIntegrationConnectionSummary(owner_context, "PLUGA", app);
    expect(summary).toMatchObject({
      integration_connection_id: connection_id,
      provider: "PLUGA",
      status: "ACTIVE",
      token_last4: "aaaa"
    });
    expect(summary && Object.keys(summary)).not.toContain("token_hash");
  });

  it("answers null for a provider with no connection yet", async () => {
    await expect(getIntegrationConnectionSummary(owner_context, "LANDING_PAGE", app)).resolves.toBeNull();
  });
});

describe("rotateIntegrationConnectionSecret", () => {
  it("is OWNER only", async () => {
    await expect(rotateIntegrationConnectionSecret(manager_context, "PLUGA", app)).rejects.toThrow(
      /Only OWNER/
    );
  });

  it("issues a new secret and invalidates the previous hash immediately", async () => {
    const before = await seeder.integrationConnection.findUniqueOrThrow({
      where: { id: connection_id }
    });

    const rotated = await rotateIntegrationConnectionSecret(owner_context, "PLUGA", app);
    expect(rotated.integration_connection_id).toBe(connection_id);
    expect(rotated.token).toMatch(/^mtco_/);

    const after = await seeder.integrationConnection.findUniqueOrThrow({
      where: { id: connection_id }
    });
    expect(after.token_hash).not.toBe(before.token_hash);
    expect(after.token_hash).toBe(hashIntegrationToken(rotated.token));
    expect(after.token_last4).toBe(rotated.token_last4);
  });
});

describe("setIntegrationConnectionStatus", () => {
  it("is OWNER only", async () => {
    await expect(
      setIntegrationConnectionStatus(manager_context, "PLUGA", "DISABLED", app)
    ).rejects.toThrow(/Only OWNER/);
  });

  it("disables and re-enables without touching the stored secret", async () => {
    const before = await seeder.integrationConnection.findUniqueOrThrow({
      where: { id: connection_id }
    });

    await setIntegrationConnectionStatus(owner_context, "PLUGA", "DISABLED", app);
    await expect(
      seeder.integrationConnection.findUniqueOrThrow({ where: { id: connection_id } })
    ).resolves.toMatchObject({ status: "DISABLED", token_hash: before.token_hash });

    await setIntegrationConnectionStatus(owner_context, "PLUGA", "ACTIVE", app);
    await expect(
      seeder.integrationConnection.findUniqueOrThrow({ where: { id: connection_id } })
    ).resolves.toMatchObject({ status: "ACTIVE", token_hash: before.token_hash });
  });
});

describe("getLastSuccessfulSyncAt and requeueIntegrationEventForReprocessing", () => {
  it("answers null until an event has actually been processed, then the instant it was", async () => {
    await expect(getLastSuccessfulSyncAt(manager_context, app)).resolves.toBeNull();

    const event_id = randomUUID();
    const external_lead_id = `sync-${randomUUID()}`;
    const received_at = new Date("2026-08-09T10:00:00.000Z");
    await seeder.integrationEvent.create({
      data: {
        id: event_id,
        workspace_id: workspace,
        integration_connection_id: connection_id,
        raw: { name: "Maria", phone: "+5511987654321" },
        received_at
      }
    });
    const job = createJobContext({ workspace_id: workspace, integration_event_id: event_id });
    const submission = await recordLeadSubmission(
      job,
      { key: { source: "META_LEAD_ADS", external_lead_id }, integration_event_id: event_id, received_at },
      app
    );
    await applyIntakePlan(
      job,
      {
        kind: "NEW_OPPORTUNITY",
        lead_submission_id: submission.lead_submission_id,
        integration_event_id: event_id,
        person: { kind: "CREATE" },
        contacts: { name: "Maria", phones: ["+5511987654321"], emails: [], cpf: null },
        pipeline_id,
        stage_id: entry_stage_id,
        arrived_at: received_at,
        missing_phone: false,
        financing_type: null,
        financial_institution: null,
        installment_amount: null,
        campaign_id: null,
        campaign_name: null,
        form_id: null,
        form_name: null,
        reviews: []
      },
      app
    );

    await expect(getLastSuccessfulSyncAt(manager_context, app)).resolves.toEqual(
      expect.any(Date)
    );
  });

  it("resets a processed event back to PENDING dispatch so the same dispatcher picks it up again", async () => {
    const event_id = randomUUID();
    await seeder.integrationEvent.create({
      data: {
        id: event_id,
        workspace_id: workspace,
        integration_connection_id: connection_id,
        raw: { name: "Requeue" },
        dispatch_status: "DISPATCHED",
        dispatched_at: new Date()
      }
    });

    await requeueIntegrationEventForReprocessing(manager_context, event_id, app);

    await expect(
      seeder.integrationEvent.findUniqueOrThrow({ where: { id: event_id } })
    ).resolves.toMatchObject({ dispatch_status: "PENDING", dispatched_at: null });
  });

  it("refuses with an explanation when the payload already expired, instead of failing obscurely", async () => {
    const event_id = randomUUID();
    const received_at = new Date("2020-01-01T00:00:00.000Z");
    // Omitting `raw` leaves it NULL — standing in for the retention job that
    // erases the content after 90 days while the row itself survives forever
    // (ADR-0014).
    await seeder.integrationEvent.create({
      data: {
        id: event_id,
        workspace_id: workspace,
        integration_connection_id: connection_id,
        received_at
      }
    });

    const attempt = requeueIntegrationEventForReprocessing(manager_context, event_id, app);
    await expect(attempt).rejects.toBeInstanceOf(IntegrationEventPayloadExpiredError);
    await expect(attempt).rejects.toMatchObject({
      expired_at: integrationEventPayloadExpiresAt(received_at)
    });
  });

  it("is Gestão and up, not Atendente", async () => {
    const attendant_context = createUserContextFromResolvedMembership({
      workspace_id: workspace,
      user_id: randomUUID(),
      role: "ATTENDANT"
    });
    await expect(getLastSuccessfulSyncAt(attendant_context, app)).rejects.toThrow(/MANAGER or OWNER/);
  });
});
