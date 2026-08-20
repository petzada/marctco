import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { whatsAppInstanceNameFor } from "@marctco/domain";
import { createUserContextFromResolvedMembership } from "../src/access-context.js";
import { recordWhatsAppInbound } from "../src/channel-inbound.js";
import {
  generateIntegrationToken,
  hashIntegrationToken,
  resolveWorkspaceByIntegrationToken
} from "../src/integration-connection.js";
import { listLeadTimeline } from "../src/lead-timeline.js";

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
const pipeline = randomUUID();
const entry_stage = randomUUID();
const manager_user = randomUUID();
const instance_name = whatsAppInstanceNameFor(workspace);
const other_instance_name = whatsAppInstanceNameFor(other_workspace);
const generated = generateIntegrationToken();
const other_token = generateIntegrationToken();
const landing_token = generateIntegrationToken();
const connection_id = randomUUID();
const other_connection_id = randomUUID();
const landing_connection_id = randomUUID();
const PHONE = "+5511999988888";
const REMOTE_JID = "5511999988888@s.whatsapp.net";
let phone_serial = 5511988000000;

function nextPhone(): string {
  phone_serial += 1;
  return `+${phone_serial}`;
}

function remoteJidFor(phone_e164: string): string {
  return `${phone_e164.replace(/^\+/, "")}@s.whatsapp.net`;
}

const manager = createUserContextFromResolvedMembership({
  workspace_id: workspace,
  user_id: manager_user,
  role: "MANAGER"
});

let arrival_clock = new Date("2026-08-19T16:00:00.000Z").getTime();
function nextArrival(): Date {
  arrival_clock += 1000;
  return new Date(arrival_clock);
}

async function seedPerson(phone_e164?: string): Promise<{ readonly id: string; readonly phone_e164: string }> {
  const phone = phone_e164 ?? nextPhone();
  const person = await seeder.person.create({
    data: { workspace_id: workspace, name: "Cliente inbound" }
  });
  await seeder.personPhone.create({
    data: { workspace_id: workspace, person_id: person.id, phone_e164: phone }
  });
  return { id: person.id, phone_e164: phone };
}

async function seedOpportunity(options: {
  readonly person_id?: string;
  readonly phone_e164?: string;
  readonly status?: "OPEN" | "WON" | "LOST";
  readonly merged?: boolean;
} = {}): Promise<{ readonly id: string; readonly person_id: string; readonly phone_e164: string }> {
  const person =
    options.person_id === undefined
      ? await seedPerson(options.phone_e164)
      : { id: options.person_id, phone_e164: options.phone_e164 ?? PHONE };
  const person_id = person.id;
  const phone_e164 = person.phone_e164;
  const status = options.status ?? "OPEN";
  const arrived_at = nextArrival();
  const opportunity = await seeder.opportunity.create({
    data: {
      workspace_id: workspace,
      person_id,
      pipeline_id: pipeline,
      stage_id: entry_stage,
      area: "COMMERCIAL",
      status,
      arrived_at,
      closed_at: status === "OPEN" ? null : new Date(arrived_at.getTime() + 60_000)
    }
  });
  if (options.merged) {
    const canonical = await seeder.opportunity.create({
      data: {
        workspace_id: workspace,
        person_id,
        pipeline_id: pipeline,
        stage_id: entry_stage,
        area: "COMMERCIAL",
        status: "OPEN",
        arrived_at: nextArrival()
      }
    });
    await seeder.opportunity.update({
      where: { id: opportunity.id },
      data: { merged_into_opportunity_id: canonical.id }
    });
  }
  return { id: opportunity.id, person_id, phone_e164 };
}

async function seedAttempt(opportunity_id: string): Promise<void> {
  await seeder.channelOutboundAttempt.create({
    data: {
      workspace_id: workspace,
      opportunity_id,
      kind: "AUTO_FIRST_CONTACT"
    }
  });
}

function textEnvelope(options: {
  readonly id: string;
  readonly fromMe?: boolean;
  readonly remoteJid?: string;
  readonly instance?: string;
  readonly instanceId?: string | null;
  readonly conversation?: string;
  readonly messageTimestamp?: number;
  readonly date_time?: string;
}): Record<string, unknown> {
  return {
    event: "messages.upsert",
    instance: options.instance ?? instance_name,
    date_time: options.date_time ?? "2026-08-19T16:00:00.000Z",
    data: {
      key: {
        id: options.id,
        remoteJid: options.remoteJid ?? REMOTE_JID,
        fromMe: options.fromMe ?? false
      },
      message: { conversation: options.conversation ?? "Oi, voltei" },
      messageType: "conversation",
      messageTimestamp: options.messageTimestamp ?? 1724079600,
      ...(options.instanceId === null ? {} : { instanceId: options.instanceId ?? instance_name })
    }
  };
}

function inboundFor(
  phone_e164: string,
  id: string,
  extra: Omit<Parameters<typeof textEnvelope>[0], "id" | "remoteJid"> = {}
): Record<string, unknown> {
  return textEnvelope({ id, remoteJid: remoteJidFor(phone_e164), ...extra });
}

beforeAll(async () => {
  await seeder.$transaction(async (transaction) => {
    await transaction.workspace.createMany({
      data: [
        { id: workspace, slug: randomUUID(), name: "Canal inbound" },
        { id: other_workspace, slug: randomUUID(), name: "Outro canal" }
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
    await transaction.pipeline.create({
      data: {
        workspace_id: other_workspace,
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
    await transaction.workspaceMember.create({
      data: {
        workspace_id: workspace,
        user_id: manager_user,
        role: "MANAGER",
        display_name: "Marina Gestão"
      }
    });
    await transaction.integrationConnection.createMany({
      data: [
        {
          id: connection_id,
          workspace_id: workspace,
          provider: "WHATSMIAU",
          token_hash: generated.token_hash,
          token_last4: generated.token_last4,
          instance_name,
          pairing_state: "DISCONNECTED"
        },
        {
          id: other_connection_id,
          workspace_id: other_workspace,
          provider: "WHATSMIAU",
          token_hash: other_token.token_hash,
          token_last4: other_token.token_last4,
          instance_name: other_instance_name,
          pairing_state: "CONNECTED"
        },
        {
          id: landing_connection_id,
          workspace_id: workspace,
          provider: "LANDING_PAGE",
          token_hash: landing_token.token_hash,
          token_last4: landing_token.token_last4
        }
      ]
    });
  });
});

afterAll(async () => {
  await seeder.workspace.deleteMany({ where: { id: { in: [workspace, other_workspace] } } });
  await Promise.all([seeder.$disconnect(), app.$disconnect()]);
});

describe("recordWhatsAppInbound", () => {
  it("refuses an inactive or mismatched token without writing a fact", async () => {
    const { id: opportunity_id } = await seedOpportunity();
    const before = await seeder.opportunityTimelineEvent.count({
      where: { opportunity_id, type: "WHATSAPP_INBOUND_RECEIVED" }
    });
    await expect(
      recordWhatsAppInbound(
        { workspace_id: workspace, integration_connection_id: connection_id, token: "mtco_unknown_token", envelope: textEnvelope({ id: "3EB0AUTH" }) },
        app
      )
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(
      await seeder.opportunityTimelineEvent.count({
        where: { opportunity_id, type: "WHATSAPP_INBOUND_RECEIVED" }
      })
    ).toBe(before);
  });

  it("refuses a fabricated connection id and a connection from another workspace", async () => {
    const { id: opportunity_id } = await seedOpportunity();
    const before = await seeder.opportunityTimelineEvent.count({
      where: { opportunity_id, type: "WHATSAPP_INBOUND_RECEIVED" }
    });
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: workspace,
          token: generated.token,
          envelope: textEnvelope({ id: "3EB0FABRICATED" })
        },
        app
      )
    ).resolves.toEqual({ kind: "unauthorized" });
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: other_connection_id,
          token: generated.token,
          envelope: textEnvelope({ id: "3EB0CROSSTENANT" })
        },
        app
      )
    ).resolves.toEqual({ kind: "unauthorized" });
    expect(
      await seeder.opportunityTimelineEvent.count({
        where: { opportunity_id, type: "WHATSAPP_INBOUND_RECEIVED" }
      })
    ).toBe(before);
  });

  it("refuses a token that belongs to another provider", async () => {
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: landing_connection_id,
          token: landing_token.token,
          envelope: textEnvelope({ id: "3EB0PLUGA" })
        },
        app
      )
    ).resolves.toEqual({ kind: "unauthorized" });
  });

  it("resolves the authenticated connection without inventing an id", async () => {
    await expect(resolveWorkspaceByIntegrationToken(generated.token, app)).resolves.toEqual({
      workspace_id: workspace,
      integration_connection_id: connection_id
    });
    await expect(resolveWorkspaceByIntegrationToken(landing_token.token, app)).resolves.toEqual({
      workspace_id: workspace,
      integration_connection_id: landing_connection_id
    });
  });

  it("ignores a payload whose instance does not match the authenticated connection", async () => {
    await seedOpportunity();
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: textEnvelope({ id: "3EB0WRONGINSTANCE", instance: other_instance_name })
        },
        app
      )
    ).resolves.toEqual({ kind: "ignored", reason: "instance_mismatch" });
  });

  it("ignores outbound echo and group JIDs", async () => {
    await seedOpportunity();
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: textEnvelope({ id: "3EB0ECHO", fromMe: true })
        },
        app
      )
    ).resolves.toEqual({ kind: "ignored", reason: "echo" });
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: textEnvelope({
            id: "3EB0GROUP",
            remoteJid: "1203630-grupo@g.us"
          })
        },
        app
      )
    ).resolves.toEqual({ kind: "ignored", reason: "group" });
  });

  it("records text on the opportunity tied to the outbound attempt", async () => {
    const seeded = await seedOpportunity();
    await seedAttempt(seeded.id);
    const result = await recordWhatsAppInbound(
      {
        workspace_id: workspace,
        integration_connection_id: connection_id,
        token: generated.token,
        envelope: inboundFor(seeded.phone_e164, "3EB0ATTEMPT", { conversation: "Resposta do cliente" })
      },
      app
    );
    expect(result).toMatchObject({ kind: "recorded", opportunity_id: seeded.id });
    const page = await listLeadTimeline(manager, seeded.id, {}, app);
    expect(page.facts.some((fact) => fact.type === "WHATSAPP_INBOUND_RECEIVED")).toBe(true);
    const stored = await seeder.opportunityTimelineEvent.findFirstOrThrow({
      where: { opportunity_id: seeded.id, type: "WHATSAPP_INBOUND_RECEIVED", external_message_id: "3EB0ATTEMPT" }
    });
    expect(stored.message_preview).toBe("Resposta do cliente");
    expect(stored.external_message_id).toBe("3EB0ATTEMPT");
    expect(stored.occurred_at.toISOString()).toBe("2024-08-19T15:00:00.000Z");
  });

  it("ignores ambiguity when more than one opportunity of the same phone has an outbound attempt", async () => {
    const person = await seedPerson();
    const first = await seedOpportunity({ person_id: person.id, phone_e164: person.phone_e164 });
    const second = await seedOpportunity({ person_id: person.id, phone_e164: person.phone_e164 });
    await seedAttempt(first.id);
    await seedAttempt(second.id);
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: inboundFor(person.phone_e164, "3EB0TWOOPPS")
        },
        app
      )
    ).resolves.toEqual({ kind: "ignored", reason: "ambiguous" });
  });

  it("records a generic media preview without storing the download URL", async () => {
    const seeded = await seedOpportunity();
    const result = await recordWhatsAppInbound(
      {
        workspace_id: workspace,
        integration_connection_id: connection_id,
        token: generated.token,
        envelope: {
          event: "messages.upsert",
          instance: instance_name,
          date_time: "2026-08-19T16:00:00.000Z",
          data: {
            key: { id: "3EB0MEDIA", remoteJid: remoteJidFor(seeded.phone_e164), fromMe: false },
            message: {
              imageMessage: { caption: "comprovante", url: "https://media.example.invalid/secret" }
            },
            messageType: "imageMessage",
            messageTimestamp: 1724079600
          }
        }
      },
      app
    );
    expect(result).toMatchObject({ kind: "recorded", opportunity_id: seeded.id });
    const stored = await seeder.opportunityTimelineEvent.findFirstOrThrow({
      where: { external_message_id: "3EB0MEDIA" }
    });
    expect(stored.message_preview).toBe("imageMessage: comprovante");
    expect(JSON.stringify(stored)).not.toContain("example.invalid");
  });

  it("falls back to the single open unmerged opportunity when there is no attempt", async () => {
    const seeded = await seedOpportunity();
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: inboundFor(seeded.phone_e164, "3EB0FALLBACK")
        },
        app
      )
    ).resolves.toMatchObject({ kind: "recorded", opportunity_id: seeded.id });
  });

  it("ignores ambiguity among open opportunities with a safe result", async () => {
    const person = await seedPerson("+5511988887777");
    await seedOpportunity({ person_id: person.id, phone_e164: person.phone_e164 });
    await seedOpportunity({ person_id: person.id, phone_e164: person.phone_e164 });
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: textEnvelope({
            id: "3EB0AMBIGUOUS",
            remoteJid: "5511988887777@s.whatsapp.net"
          })
        },
        app
      )
    ).resolves.toEqual({ kind: "ignored", reason: "ambiguous" });
    expect(
      await seeder.opportunityTimelineEvent.count({
        where: { workspace_id: workspace, external_message_id: "3EB0AMBIGUOUS" }
      })
    ).toBe(0);
  });

  it("does not duplicate a retried provider message id", async () => {
    const seeded = await seedOpportunity();
    const envelope = inboundFor(seeded.phone_e164, "3EB0DEDUP");
    const first = await recordWhatsAppInbound(
        { workspace_id: workspace, integration_connection_id: connection_id, token: generated.token, envelope },
      app
    );
    const second = await recordWhatsAppInbound(
        { workspace_id: workspace, integration_connection_id: connection_id, token: generated.token, envelope },
      app
    );
    expect(first.kind).toBe("recorded");
    expect(second).toEqual({ kind: "duplicate", opportunity_id: seeded.id });
    expect(
      await seeder.opportunityTimelineEvent.count({
        where: { opportunity_id: seeded.id, type: "WHATSAPP_INBOUND_RECEIVED", external_message_id: "3EB0DEDUP" }
      })
    ).toBe(1);
  });

  it("stamps first_contact_at once from Unix seconds and keeps a later inbound from overwriting", async () => {
    const seeded = await seedOpportunity();
    await recordWhatsAppInbound(
      {
        workspace_id: workspace,
        integration_connection_id: connection_id,
        token: generated.token,
        envelope: inboundFor(seeded.phone_e164, "3EB0FIRST", { messageTimestamp: 1724079600 })
      },
      app
    );
    const first = await seeder.opportunity.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(first.first_contact_at?.toISOString()).toBe("2024-08-19T15:00:00.000Z");
    await recordWhatsAppInbound(
      {
        workspace_id: workspace,
        integration_connection_id: connection_id,
        token: generated.token,
        envelope: inboundFor(seeded.phone_e164, "3EB0SECOND", { messageTimestamp: 1724166000 })
      },
      app
    );
    const second = await seeder.opportunity.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(second.first_contact_at?.toISOString()).toBe("2024-08-19T15:00:00.000Z");
  });

  it("uses envelope date_time when messageTimestamp is out of range", async () => {
    const seeded = await seedOpportunity();
    await recordWhatsAppInbound(
      {
        workspace_id: workspace,
        integration_connection_id: connection_id,
        token: generated.token,
        envelope: inboundFor(seeded.phone_e164, "3EB0ISOFALLBACK", {
          messageTimestamp: 12,
          date_time: "2026-08-19T16:30:00.000Z"
        })
      },
      app
    );
    const stored = await seeder.opportunity.findUniqueOrThrow({ where: { id: seeded.id } });
    expect(stored.first_contact_at?.toISOString()).toBe("2026-08-19T16:30:00.000Z");
  });

  it("maps connection.update open and close onto pairing state", async () => {
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: {
            event: "connection.update",
            instance: instance_name,
            date_time: "2026-08-19T16:00:00.000Z",
            data: { instance: instance_name, state: "open", statusReason: 200 }
          }
        },
        app
      )
    ).resolves.toEqual({ kind: "connection_updated", pairing_state: "CONNECTED" });
    expect(
      (await seeder.integrationConnection.findFirstOrThrow({ where: { workspace_id: workspace, provider: "WHATSMIAU" } }))
        .pairing_state
    ).toBe("CONNECTED");

    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: {
            event: "connection.update",
            instance: instance_name,
            date_time: "2026-08-19T16:00:00.000Z",
            data: { instance: instance_name, state: "close", statusReason: 401 }
          }
        },
        app
      )
    ).resolves.toEqual({ kind: "connection_updated", pairing_state: "DISCONNECTED" });
  });

  it("sets local ERROR for an unknown connection state without inventing a catalog", async () => {
    await expect(
      recordWhatsAppInbound(
        {
          workspace_id: workspace,
          integration_connection_id: connection_id,
          token: generated.token,
          envelope: {
            event: "connection.update",
            instance: instance_name,
            date_time: "2026-08-19T16:00:00.000Z",
            data: { instance: instance_name, state: "weird", statusReason: 515 }
          }
        },
        app
      )
    ).resolves.toEqual({ kind: "connection_updated", pairing_state: "ERROR" });
  });
});

describe("hash of the inbound webhook token", () => {
  it("stores only the SHA-256 digest on the WhatsMiau connection", async () => {
    const stored = await seeder.integrationConnection.findFirstOrThrow({
      where: { workspace_id: workspace, provider: "WHATSMIAU" }
    });
    expect(stored.token_hash).toBe(hashIntegrationToken(generated.token));
    expect(stored.token_hash).not.toBe(generated.token);
  });
});
