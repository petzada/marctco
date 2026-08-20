import { Prisma, type PrismaClient } from "@prisma/client";
import {
  parseWhatsMiauWebhookEnvelope,
  type WhatsAppPairingState,
  type WhatsMiauWebhookParse
} from "@marctco/domain";
import { createJobContext, jobChannelInboundConnectionId } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  hashIntegrationToken,
  integrationTokenHashesEqual
} from "./integration-connection.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext, type ScopedTransactionClient } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export type WhatsAppInboundIgnoreReason =
  | "echo"
  | "group"
  | "unknown_event"
  | "instance_mismatch"
  | "unresolved"
  | "ambiguous"
  | "invalid_envelope";

export type WhatsAppInboundResult =
  | { readonly kind: "unauthorized" }
  | { readonly kind: "ignored"; readonly reason: WhatsAppInboundIgnoreReason }
  | {
      readonly kind: "recorded";
      readonly opportunity_id: string;
      readonly fact_id: string;
    }
  | { readonly kind: "duplicate"; readonly opportunity_id: string }
  | { readonly kind: "connection_updated"; readonly pairing_state: WhatsAppPairingState };

export interface RecordWhatsAppInboundInput {
  readonly workspace_id: string;
  readonly integration_connection_id: string;
  readonly token: string;
  readonly envelope: unknown;
}

interface WhatsAppConnectionRow {
  readonly id: string;
  readonly workspace_id: string;
  readonly instance_name: string | null;
  readonly token_hash: string;
}

interface OpportunityIdRow {
  readonly opportunity_id: string;
}

interface FactIdRow {
  readonly id: string;
}

/**
 * Persists an authenticated WhatsMiau webhook. The caller has already
 * resolved both technical ids through the existing token-hash function;
 * this operation builds `JobContext.origin.channel_inbound` with that real
 * connection and re-reads it under RLS. It never fabricates an origin,
 * integration event or outbound attempt.
 */
export async function recordWhatsAppInbound(
  input: RecordWhatsAppInboundInput,
  prisma: PrismaClient = sharedPrisma
): Promise<WhatsAppInboundResult> {
  assertUuid(input.workspace_id, "workspace_id");
  assertUuid(input.integration_connection_id, "integration_connection_id");
  if (typeof input.token !== "string" || input.token === "") {
    return { kind: "unauthorized" };
  }

  const token_hash = hashIntegrationToken(input.token);
  const context = createJobContext({
    workspace_id: input.workspace_id,
    origin: { type: "channel_inbound", integration_connection_id: input.integration_connection_id }
  });

  return withAccessContext(prisma, context, async (transaction, job) => {
    const connection = await loadWhatsAppConnection(transaction, {
      integration_connection_id: jobChannelInboundConnectionId(job),
      token_hash
    });
    if (
      !connection ||
      connection.workspace_id !== job.workspace_id ||
      connection.id !== jobChannelInboundConnectionId(job) ||
      connection.instance_name === null ||
      !integrationTokenHashesEqual(token_hash, connection.token_hash)
    ) {
      return { kind: "unauthorized" };
    }

    const parsed = parseWhatsMiauWebhookEnvelope(input.envelope);
    return persistParsedInbound(transaction, {
      workspace_id: job.workspace_id,
      integration_connection_id: connection.id,
      instance_name: connection.instance_name,
      parsed
    });
  });
}

async function persistParsedInbound(
  transaction: ScopedTransactionClient,
  input: {
    readonly workspace_id: string;
    readonly integration_connection_id: string;
    readonly instance_name: string;
    readonly parsed: WhatsMiauWebhookParse;
  }
): Promise<WhatsAppInboundResult> {
  if (input.parsed.kind === "invalid") {
    return { kind: "ignored", reason: "invalid_envelope" };
  }
  if (input.parsed.kind === "ignored") {
    return { kind: "ignored", reason: input.parsed.reason };
  }
  if (input.parsed.instance !== input.instance_name) {
    return { kind: "ignored", reason: "instance_mismatch" };
  }

  if (input.parsed.kind === "connection") {
    if (input.parsed.data_instance !== input.instance_name) {
      return { kind: "ignored", reason: "instance_mismatch" };
    }
    await transaction.$executeRaw(Prisma.sql`
      UPDATE integration_connections
      SET pairing_state = ${input.parsed.pairing_state}::whatsapp_pairing_state,
          updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${input.workspace_id}::uuid
        AND id = ${input.integration_connection_id}::uuid
        AND provider = 'WHATSMIAU'::integration_provider
    `);
    return { kind: "connection_updated", pairing_state: input.parsed.pairing_state };
  }

  if (input.parsed.instance_id !== null && input.parsed.instance_id !== input.instance_name) {
    return { kind: "ignored", reason: "instance_mismatch" };
  }

  const resolved = await resolveInboundOpportunity(transaction, {
    workspace_id: input.workspace_id,
    destination_e164: input.parsed.destination_e164
  });
  if (resolved.kind !== "matched") {
    return resolved;
  }

  const occurred_at = input.parsed.occurred_at;
  const inserted = await transaction.$queryRaw<FactIdRow[]>(Prisma.sql`
    INSERT INTO opportunity_timeline_events (
      workspace_id, opportunity_id, type, lead_submission_id,
      integration_event_id, occurred_at, integration_connection_id,
      external_message_id, message_preview
    )
    VALUES (
      ${input.workspace_id}::uuid,
      ${resolved.opportunity_id}::uuid,
      'WHATSAPP_INBOUND_RECEIVED'::opportunity_timeline_event_type,
      NULL,
      NULL,
      COALESCE(${occurred_at}::timestamptz, CURRENT_TIMESTAMP),
      ${input.integration_connection_id}::uuid,
      ${input.parsed.external_message_id},
      ${input.parsed.preview}
    )
    ON CONFLICT (workspace_id, integration_connection_id, external_message_id)
    WHERE type = 'WHATSAPP_INBOUND_RECEIVED'::opportunity_timeline_event_type
    DO NOTHING
    RETURNING id
  `);
  const fact = inserted[0];
  if (!fact) {
    return { kind: "duplicate", opportunity_id: resolved.opportunity_id };
  }

  if (occurred_at !== null) {
    await transaction.$executeRaw(Prisma.sql`
      UPDATE opportunities
      SET
        first_contact_at = ${occurred_at}::timestamptz,
        updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${input.workspace_id}::uuid
        AND id = ${resolved.opportunity_id}::uuid
        AND first_contact_at IS NULL
    `);
  }

  return {
    kind: "recorded",
    opportunity_id: resolved.opportunity_id,
    fact_id: fact.id
  };
}

async function resolveInboundOpportunity(
  transaction: ScopedTransactionClient,
  input: { readonly workspace_id: string; readonly destination_e164: string }
): Promise<
  | { readonly kind: "matched"; readonly opportunity_id: string }
  | { readonly kind: "ignored"; readonly reason: "unresolved" | "ambiguous" }
> {
  const by_attempt = await transaction.$queryRaw<OpportunityIdRow[]>(Prisma.sql`
    SELECT DISTINCT attempt.opportunity_id
    FROM channel_outbound_attempts AS attempt
    JOIN opportunities AS opportunity
      ON opportunity.workspace_id = attempt.workspace_id
     AND opportunity.id = attempt.opportunity_id
    JOIN person_phones AS phone
      ON phone.workspace_id = opportunity.workspace_id
     AND phone.person_id = opportunity.person_id
     AND phone.phone_e164 = ${input.destination_e164}
    WHERE attempt.workspace_id = ${input.workspace_id}::uuid
      AND opportunity.merged_into_opportunity_id IS NULL
  `);
  if (by_attempt.length > 1) {
    return { kind: "ignored", reason: "ambiguous" };
  }
  if (by_attempt[0]) {
    return { kind: "matched", opportunity_id: by_attempt[0].opportunity_id };
  }

  const open = await transaction.$queryRaw<OpportunityIdRow[]>(Prisma.sql`
    SELECT opportunity.id AS opportunity_id
    FROM person_phones AS phone
    JOIN opportunities AS opportunity
      ON opportunity.workspace_id = phone.workspace_id
     AND opportunity.person_id = phone.person_id
    WHERE phone.workspace_id = ${input.workspace_id}::uuid
      AND phone.phone_e164 = ${input.destination_e164}
      AND opportunity.status = 'OPEN'::opportunity_status
      AND opportunity.merged_into_opportunity_id IS NULL
  `);
  if (open.length > 1) {
    return { kind: "ignored", reason: "ambiguous" };
  }
  if (open[0]) {
    return { kind: "matched", opportunity_id: open[0].opportunity_id };
  }
  return { kind: "ignored", reason: "unresolved" };
}

async function loadWhatsAppConnection(
  transaction: ScopedTransactionClient,
  input: { readonly integration_connection_id: string; readonly token_hash: string }
): Promise<WhatsAppConnectionRow | null> {
  const rows = await transaction.$queryRaw<WhatsAppConnectionRow[]>`
    SELECT id, workspace_id, instance_name, token_hash
    FROM integration_connections
    WHERE id = ${input.integration_connection_id}::uuid
      AND token_hash = ${input.token_hash}
      AND provider = 'WHATSMIAU'::integration_provider
      AND status = 'ACTIVE'
  `;
  return rows[0] ?? null;
}
