import type { PrismaClient } from "@prisma/client";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  generateIntegrationToken,
  type IntegrationConnectionStatus,
  type IntegrationProvider
} from "./integration-connection.js";
import { withAccessContext } from "./internal/scoped-transaction.js";
import { assertUuid, isUuid } from "./internal/uuid.js";

const sharedPrisma = createPrismaClient();

/**
 * A workspace holds N connections per provider since ADR-0031, so nothing here
 * resolves a connection by its provider any more. Every write names the row it
 * means, and RLS keeps that id inside the caller's workspace: an id from
 * another tenant matches nothing rather than answering.
 *
 * `WHERE provider = ...` was the old resolver, and it was correct only while
 * `UNIQUE(workspace_id, provider)` guaranteed one row. Left in place after the
 * drop it would silently rotate or disable an arbitrary one of several.
 */

const NAME_MAX_LENGTH = 80;

export const DUPLICATE_CONNECTION_NAME = "A connection with this name already exists";
export const NO_SUCH_CONNECTION = "There is no such integration connection in this workspace";

export interface CreateIntegrationConnectionInput {
  readonly provider: IntegrationProvider;
  /** What the client calls this origin: "LP institucional", "Pluga ACR". */
  readonly name: string;
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

function normaliseName(name: unknown): string {
  if (typeof name !== "string" || name.trim() === "") {
    throw new Error("An integration connection needs a name");
  }
  const trimmed = name.trim();
  if (trimmed.length > NAME_MAX_LENGTH) {
    throw new Error(`An integration connection name is at most ${NAME_MAX_LENGTH} characters`);
  }
  return trimmed;
}

/**
 * Creates the connection an origin authenticates with. Only Direcao can: the
 * integration secret is account material, not operational configuration
 * (ADR-0015).
 *
 * The name collides case-insensitively, against a migration-only unique index
 * on `(workspace_id, lower(name))`. `ON CONFLICT DO NOTHING` reports it rather
 * than a caught unique violation: in Postgres an error aborts the whole
 * transaction, and the empty `RETURNING` is the same signal without the
 * wreckage (ADR-0007 Mecanismo 1).
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
  const name = normaliseName(input.name);

  const generated = generateIntegrationToken();
  const created = await withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<IdRow[]>`
      INSERT INTO integration_connections (
        workspace_id, provider, name, token_hash, token_last4, target_pipeline_id, updated_at
      )
      VALUES (
        ${context.workspace_id}::uuid,
        ${input.provider}::integration_provider,
        ${name},
        ${generated.token_hash},
        ${generated.token_last4},
        ${input.target_pipeline_id ?? null}::uuid,
        CURRENT_TIMESTAMP
      )
      ON CONFLICT DO NOTHING
      RETURNING id
    `;
    return rows[0];
  });
  if (!created) {
    throw new Error(DUPLICATE_CONNECTION_NAME);
  }

  return {
    integration_connection_id: created.id,
    token: generated.token,
    token_last4: generated.token_last4
  };
}

export interface IntegrationConnectionSummary {
  readonly integration_connection_id: string;
  readonly provider: IntegrationProvider;
  readonly name: string;
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
  readonly name: string;
  readonly status: IntegrationConnectionStatus;
  readonly token_last4: string;
  readonly target_pipeline_id: string | null;
  readonly created_at: Date;
  readonly updated_at: Date;
}

function toSummary(row: ConnectionSummaryRow): IntegrationConnectionSummary {
  return {
    integration_connection_id: row.id,
    provider: row.provider,
    name: row.name,
    status: row.status,
    token_last4: row.token_last4,
    target_pipeline_id: row.target_pipeline_id,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Every connection of one provider, oldest first — masked secret material
 * only, never `token_hash` and never the clear token.
 *
 * Direcao only. ADR-0015 splits the Integracoes screen along the credential
 * line: Gestao operates the pipe, Direcao owns what authenticates it. An empty
 * list rather than a throw lets the screen render its own empty state.
 *
 * Ordered by `created_at` so the screen does not reshuffle when a connection is
 * rotated or disabled; `id` breaks the tie, because two rows can be created
 * inside the same millisecond.
 */
export async function listIntegrationConnections(
  context: UserContext,
  provider: IntegrationProvider,
  prisma: PrismaClient = sharedPrisma
): Promise<readonly IntegrationConnectionSummary[]> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can read the integration connection secret");
  }

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<ConnectionSummaryRow[]>`
      SELECT
        id,
        provider::text AS provider,
        name,
        status::text AS status,
        token_last4,
        target_pipeline_id,
        created_at,
        updated_at
      FROM integration_connections
      WHERE provider = ${provider}::integration_provider
      ORDER BY created_at ASC, id ASC
    `
  );
  return rows.map(toSummary);
}

/**
 * One connection by id, or null when the id names nothing this workspace can
 * see. RLS is what scopes it: a well-formed id from another tenant reads as
 * absent instead of answering, so the row never becomes an existence oracle
 * (ADR-0006).
 *
 * Direcao only, same gate as the list.
 */
export async function getIntegrationConnectionSummary(
  context: UserContext,
  integration_connection_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<IntegrationConnectionSummary | null> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can read the integration connection secret");
  }
  assertUuid(integration_connection_id, "integration_connection_id");

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<ConnectionSummaryRow[]>`
      SELECT
        id,
        provider::text AS provider,
        name,
        status::text AS status,
        token_last4,
        target_pipeline_id,
        created_at,
        updated_at
      FROM integration_connections
      WHERE id = ${integration_connection_id}::uuid
    `
  );
  const row = rows[0];
  return row ? toSummary(row) : null;
}

/**
 * Rotates the bearer secret in place: same connection row, a new
 * `token_hash`/`token_last4`. The previous token stops resolving the instant
 * this commits, because `resolveWorkspaceByIntegrationToken` has no cache and
 * looks up by the (now different) hash — there is no second step that
 * "expires" the old value (ADR-0007).
 *
 * Names one connection, so rotating the secret of one landing page cannot
 * silence another.
 *
 * Direcao only, same gate as generating the secret the first time.
 */
export async function rotateIntegrationConnectionSecret(
  context: UserContext,
  integration_connection_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<CreatedIntegrationConnection> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can rotate an integration connection secret");
  }
  assertUuid(integration_connection_id, "integration_connection_id");

  const generated = generateIntegrationToken();
  const updated = await withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<IdRow[]>`
      UPDATE integration_connections
      SET token_hash = ${generated.token_hash},
          token_last4 = ${generated.token_last4},
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${integration_connection_id}::uuid
      RETURNING id
    `;
    return rows[0];
  });
  if (!updated) {
    throw new Error(NO_SUCH_CONNECTION);
  }

  return {
    integration_connection_id: updated.id,
    token: generated.token,
    token_last4: generated.token_last4
  };
}

/**
 * Enables or disables one connection without deleting its configuration: the
 * token, its hash and the target pipeline all survive a disable, so turning it
 * back on needs no new secret and no re-paste in Pluga.
 *
 * Scoped to a single connection, so disabling one landing page cannot silence
 * the other — the reason the provider stopped being the resolver.
 *
 * Direcao only (ADR-0015) — the same line generate/rotate sits on, because
 * disabling is the credential's off switch, not an operational action.
 */
export async function setIntegrationConnectionStatus(
  context: UserContext,
  integration_connection_id: string,
  status: IntegrationConnectionStatus,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  if (context.role !== "OWNER") {
    throw new Error("Only OWNER can enable or disable an integration connection");
  }
  assertUuid(integration_connection_id, "integration_connection_id");

  await withAccessContext(prisma, context, async (transaction) => {
    const updated = await transaction.$executeRaw`
      UPDATE integration_connections
      SET status = ${status}::integration_connection_status,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ${integration_connection_id}::uuid
    `;
    if (updated === 0) {
      throw new Error(NO_SUCH_CONNECTION);
    }
  });
}
