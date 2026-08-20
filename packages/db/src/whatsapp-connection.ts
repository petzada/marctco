import { Prisma, type PrismaClient } from "@prisma/client";
import {
  isWhatsAppPairingState,
  whatsAppInstanceNameFor,
  type WhatsAppPairingState
} from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  generateIntegrationToken,
  type IntegrationConnectionStatus
} from "./integration-connection.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { withAccessContext } from "./internal/scoped-transaction.js";
import { assertUuid } from "./internal/uuid.js";

const sharedPrisma = createPrismaClient();

export class WhatsAppConnectionError extends Error {
  constructor(readonly code: "FORBIDDEN" | "NOT_FOUND") {
    super(code);
    this.name = "WhatsAppConnectionError";
  }
}

export interface WhatsAppConnectionView {
  readonly integration_connection_id: string;
  readonly instance_name: string;
  readonly status: IntegrationConnectionStatus;
  readonly pairing_state: WhatsAppPairingState;
  readonly created_at: Date;
  readonly updated_at: Date;
}

export interface CreatedWhatsAppConnection extends WhatsAppConnectionView {
  readonly created: boolean;
  /** Present only when the row was just inserted. Never round-tripped to the browser. */
  readonly webhook_token: string | null;
}

interface WhatsAppConnectionRow {
  readonly id: string;
  readonly instance_name: string;
  readonly status: IntegrationConnectionStatus;
  readonly pairing_state: string;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function canReadWhatsAppConnection(role: UserContext["role"]): boolean {
  return role === "MANAGER" || role === "OWNER";
}

function toView(row: WhatsAppConnectionRow): WhatsAppConnectionView {
  if (!isWhatsAppPairingState(row.pairing_state)) {
    throw new Error("Stored WhatsApp pairing state is not a known value");
  }
  return {
    integration_connection_id: row.id,
    instance_name: row.instance_name,
    status: row.status,
    pairing_state: row.pairing_state,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

async function readWhatsAppConnection(
  context: UserContext,
  prisma: PrismaClient
): Promise<WhatsAppConnectionView | null> {
  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<WhatsAppConnectionRow[]>`
      SELECT
        id,
        instance_name,
        status::text AS status,
        pairing_state::text AS pairing_state,
        created_at,
        updated_at
      FROM integration_connections
      WHERE provider = 'WHATSMIAU'::integration_provider
    `
  );
  const row = rows[0];
  return row ? toView(row) : null;
}

/**
 * Gestão and Direção read pairing and administrative status. Secret material
 * — token, hash, last four — is never selected.
 */
export async function getWhatsAppConnection(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<WhatsAppConnectionView | null> {
  if (!canReadWhatsAppConnection(context.role)) {
    throw new WhatsAppConnectionError("FORBIDDEN");
  }
  return readWhatsAppConnection(context, prisma);
}

/**
 * Inserts the single WhatsMiau connection for this workspace. The clear
 * webhook token is returned only on insert so the caller can configure
 * `/webhook/set` outside the transaction (ADR-0006). A second call reuses
 * the row and does not mint a token.
 */
export async function createWhatsAppConnection(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<CreatedWhatsAppConnection> {
  if (context.role !== "OWNER") {
    throw new WhatsAppConnectionError("FORBIDDEN");
  }

  const existing = await readWhatsAppConnection(context, prisma);
  if (existing) {
    return { ...existing, created: false, webhook_token: null };
  }

  const generated = generateIntegrationToken();
  const instance_name = whatsAppInstanceNameFor(context.workspace_id);

  try {
    const rows = await withAccessContext(prisma, context, async (transaction) =>
      transaction.$queryRaw<WhatsAppConnectionRow[]>`
        INSERT INTO integration_connections (
          workspace_id, provider, token_hash, token_last4,
          instance_name, pairing_state, updated_at
        )
        VALUES (
          ${context.workspace_id}::uuid,
          'WHATSMIAU'::integration_provider,
          ${generated.token_hash},
          ${generated.token_last4},
          ${instance_name},
          'DISCONNECTED'::whatsapp_pairing_state,
          CURRENT_TIMESTAMP
        )
        RETURNING
          id,
          instance_name,
          status::text AS status,
          pairing_state::text AS pairing_state,
          created_at,
          updated_at
      `
    );
    const row = rows[0];
    if (!row) {
      throw new Error("The WhatsMiau connection was not created");
    }
    return { ...toView(row), created: true, webhook_token: generated.token };
  } catch (error) {
    const raced = await readWhatsAppConnection(context, prisma);
    if (raced) {
      return { ...raced, created: false, webhook_token: null };
    }
    throw error;
  }
}

/**
 * Caches the latest pairing reading. Gestão polls this; it is not a
 * credential change.
 */
export async function setWhatsAppPairingState(
  context: UserContext,
  pairing_state: WhatsAppPairingState,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  if (!canReadWhatsAppConnection(context.role)) {
    throw new WhatsAppConnectionError("FORBIDDEN");
  }
  if (!isWhatsAppPairingState(pairing_state)) {
    throw new Error("pairing_state is not a known WhatsApp pairing value");
  }

  await withAccessContext(prisma, context, async (transaction) => {
    const updated = await transaction.$executeRaw`
      UPDATE integration_connections
      SET pairing_state = ${pairing_state}::whatsapp_pairing_state,
          updated_at = CURRENT_TIMESTAMP
      WHERE provider = 'WHATSMIAU'::integration_provider
    `;
    if (updated === 0) {
      throw new WhatsAppConnectionError("NOT_FOUND");
    }
  });
}

export interface WhatsAppWebhookSecretCommit {
  readonly token_hash: string;
  readonly token_last4: string;
}

/**
 * Persists a webhook secret that the caller has already published to
 * `/webhook/set`. HTTP happens first, outside this function, so a failed
 * provider call leaves the previous hash valid.
 */
export async function commitWhatsAppWebhookSecret(
  context: UserContext,
  secret: WhatsAppWebhookSecretCommit,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  if (context.role !== "OWNER") {
    throw new WhatsAppConnectionError("FORBIDDEN");
  }
  if (!/^[0-9a-f]{64}$/.test(secret.token_hash) || secret.token_last4.length !== 4) {
    throw new Error("WhatsApp webhook secret material is malformed");
  }

  await withAccessContext(prisma, context, async (transaction) => {
    const updated = await transaction.$executeRaw`
      UPDATE integration_connections
      SET token_hash = ${secret.token_hash},
          token_last4 = ${secret.token_last4},
          updated_at = CURRENT_TIMESTAMP
      WHERE provider = 'WHATSMIAU'::integration_provider
    `;
    if (updated === 0) {
      throw new WhatsAppConnectionError("NOT_FOUND");
    }
  });
}

export interface OpportunityWhatsAppConnectionIndicator {
  readonly connected: boolean;
}

/**
 * Card indicator for Atendente, Supervisor, Gestão and Direção who can see
 * the lead. Returns only a boolean — never pairing details, instance name,
 * token or last four. The Gestão/Direção administrative read stays on
 * `getWhatsAppConnection`.
 */
export async function getOpportunityWhatsAppConnectionIndicator(
  context: UserContext,
  opportunity_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<OpportunityWhatsAppConnectionIndicator> {
  assertUuid(opportunity_id, "opportunity_id");

  return withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<Array<{ connected: boolean }>>(Prisma.sql`
      SELECT
        COALESCE(
          connection.pairing_state = 'CONNECTED'::whatsapp_pairing_state
          AND connection.status = 'ACTIVE'::integration_connection_status,
          false
        ) AS connected
      FROM opportunities AS opportunity
      LEFT JOIN LATERAL (
        SELECT pairing_state, status
        FROM integration_connections
        WHERE workspace_id = opportunity.workspace_id
          AND provider = 'WHATSMIAU'::integration_provider
          AND status = 'ACTIVE'::integration_connection_status
        ORDER BY updated_at DESC
        LIMIT 1
      ) AS connection ON true
      WHERE opportunity.id = ${opportunity_id}::uuid
        AND opportunity.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.merged_into_opportunity_id IS NULL
        ${opportunityScopeSql(context, "opportunity")}
    `);
    const row = rows[0];
    if (!row) {
      throw new Error("Opportunity not found in this workspace");
    }
    return { connected: row.connected === true };
  });
}
