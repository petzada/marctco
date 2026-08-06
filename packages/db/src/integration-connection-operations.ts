import type { PrismaClient } from "@prisma/client";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import {
  generateIntegrationToken,
  type IntegrationProvider
} from "./integration-connection.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
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
  if (input.target_pipeline_id !== undefined && !UUID_PATTERN.test(input.target_pipeline_id)) {
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
