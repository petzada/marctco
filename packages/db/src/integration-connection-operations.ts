import type { PrismaClient } from "@prisma/client";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  generateIntegrationToken,
  type IntegrationConnectionStatus,
  type IntegrationProvider
} from "./integration-connection.js";
import { withAccessContext } from "./internal/scoped-transaction.js";
import { isUuid } from "./internal/uuid.js";

const sharedPrisma = createPrismaClient();

export interface CreateIntegrationConnectionInput {
  readonly provider: IntegrationProvider;
  /** Absent keeps ingestion on the workspace's default commercial pipeline. */
  readonly target_pipeline_id?: string;
}

export interface CreatedIntegrationConnection {
  readonly integration_connection_id: string;
  /** Shown to the operator once. Only the hash and last four are stored. */
  readonly token: string;
  readonly token_last4: string;
}

interface IdRow {
  readonly id: string;
}

/**
 * Creates the connection an origin authenticates with. Only Direção can:
 * the integration secret is account material, not operational configuration
 * (ADR-0015).
 */
export async function createIntegrationConnection(
  context: UserContext,
  input: CreateIntegrationConnectionInput,
  prisma: PrismaClient = sharedPrisma
): Promise<CreatedIntegrationConnection> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can create an integration connection");
  }
  if (input.target_pipeline_id !== undefined && !isUuid(input.target_pipeline_id)) {
    throw new Error("target_pipeline_id must be a UUID");
  }

  const generated = generateIntegrationToken();
  const created = await withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<IdRow[]>`
      INSERT INTO integration_connections (
        workspace_id, provider, token_hash, token_last4, target_pipeline_id, updated_at
      )
      VALUES (
        ${context.workspace_id}::uuid,
        ${input.provider}::integration_provider,
        ${generated.token_hash},
        ${generated.token_last4},
        ${input.target_pipeline_id ?? null}::uuid,
        CURRENT_TIMESTAMP
      )
      RETURNING id
    `;
    const row = rows[0];
    if (!row) {
      throw new Error("The integration connection was not created");
    }
    return row;
  });

  return {
    integration_connection_id: created.id,
    token: generated.token,
    token_last4: generated.token_last4
  };
}

export interface IntegrationConnectionSummary {
  readonly integration_connection_id: string;
  readonly provider: IntegrationProvider;
  readonly status: IntegrationConnectionStatus;
  /** Enough to recognise the secret on screen. The clear token never round-trips. */
  readonly token_last4: string;
  readonly target_pipeline_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

interface ConnectionSummaryRow {
  readonly id: string;
  readonly provider: IntegrationProvider;
  readonly status: IntegrationConnectionStatus;
  readonly token_last4: string;
  readonly target_pipeline_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

/**
 * Read-only summary of a workspace's connection for one provider — masked
 * secret material only, never `token_hash` and never the clear token.
 *
 * Direção only. ADR-0015 splits the Integrações screen along the credential
 * line: "o segredo da integração é só da Direção; o histórico e o
 * reprocessamento são da Gestão" — Gestão operates the pipe, Direção owns
 * what authenticates it. Returning `null` for "no connection yet" rather than
 * throwing lets the screen render its own "gerar segredo" empty state.
 */
export async function getIntegrationConnectionSummary(
  context: UserContext,
  provider: IntegrationProvider,
  prisma: PrismaClient = sharedPrisma
): Promise<IntegrationConnectionSummary | null> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can read the integration connection secret");
  }

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<ConnectionSummaryRow[]>`
      SELECT
        id,
        provider::text AS provider,
        status::text AS status,
        token_last4,
        target_pipeline_id,
        created_at,
        updated_at
      FROM integration_connections
      WHERE provider = ${provider}::integration_provider
    `
  );
  const row = rows[0];
  if (!row) {
    return null;
  }
  return {
    integration_connection_id: row.id,
    provider: row.provider,
    status: row.status,
    token_last4: row.token_last4,
    target_pipeline_id: row.target_pipeline_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Rotates the bearer secret in place: same connection row, a new
 * `token_hash`/`token_last4`. The previous token stops resolving the instant
 * this commits, because `resolveWorkspaceByIntegrationToken` has no cache and
 * looks up by the (now different) hash — there is no second step that
 * "expires" the old value (ADR-0007).
 *
 * Direção only, same gate as generating the secret the first time
 * (`createIntegrationConnection`).
 */
export async function rotateIntegrationConnectionSecret(
  context: UserContext,
  provider: IntegrationProvider,
  prisma: PrismaClient = sharedPrisma
): Promise<CreatedIntegrationConnection> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can rotate an integration connection secret");
  }

  const generated = generateIntegrationToken();
  const updated = await withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<IdRow[]>`
      UPDATE integration_connections
      SET token_hash = ${generated.token_hash},
          token_last4 = ${generated.token_last4},
          updated_at = CURRENT_TIMESTAMP
      WHERE provider = ${provider}::integration_provider
      RETURNING id
    `;
    return rows[0];
  });
  if (!updated) {
    throw new Error("There is no integration connection to rotate for this provider yet");
  }

  return {
    integration_connection_id: updated.id,
    token: generated.token,
    token_last4: generated.token_last4
  };
}

/**
 * Enables or disables the connection without deleting its configuration: the
 * token, its hash and the target pipeline all survive a disable, so turning
 * it back on needs no new secret and no re-paste in Pluga.
 *
 * Direção only (ADR-0015) — the same line generate/rotate sits on, because
 * disabling is the credential's off switch, not an operational action.
 */
export async function setIntegrationConnectionStatus(
  context: UserContext,
  provider: IntegrationProvider,
  status: IntegrationConnectionStatus,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can enable or disable an integration connection");
  }

  await withAccessContext(prisma, context, async (transaction) => {
    const updated = await transaction.$executeRaw`
      UPDATE integration_connections
      SET status = ${status}::integration_connection_status,
          updated_at = CURRENT_TIMESTAMP
      WHERE provider = ${provider}::integration_provider
    `;
    if (updated === 0) {
      throw new Error("There is no integration connection to update for this provider yet");
    }
  });
}
