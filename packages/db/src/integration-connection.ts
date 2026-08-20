import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type {
  IntegrationConnectionStatus as PrismaIntegrationConnectionStatus,
  IntegrationProvider as PrismaIntegrationProvider,
  WhatsAppPairingState as PrismaWhatsAppPairingState,
  PrismaClient
} from "@prisma/client";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";

const TOKEN_PREFIX = "mtco_";
const TOKEN_BYTES = 32;
const HASH_HEX_PATTERN = /^[0-9a-f]{64}$/;
const sharedPrisma = createPrismaClient();

/** Re-export the generated enum so token callers cannot drift from the schema. */
export type IntegrationProvider = PrismaIntegrationProvider;
/** Re-exported for the same reason: enable/disable never invents its own values. */
export type IntegrationConnectionStatus = PrismaIntegrationConnectionStatus;
export type WhatsAppPairingState = PrismaWhatsAppPairingState;

export interface GeneratedIntegrationToken {
  /** Return this secret to the caller once; never persist or log it. */
  readonly token: string;
  readonly token_hash: string;
  readonly token_last4: string;
}

export interface ResolvedIntegrationWorkspace {
  readonly workspace_id: string;
  readonly integration_connection_id: string;
}

/**
 * Generates a 256-bit bearer token. Its clear value is intentionally only in
 * this return value: callers must hand it to the operator once and persist
 * token_hash plus token_last4 instead.
 */
export function generateIntegrationToken(
  entropy: (size: number) => Uint8Array = randomBytes
): GeneratedIntegrationToken {
  const bytes = entropy(TOKEN_BYTES);
  if (bytes.byteLength !== TOKEN_BYTES) {
    throw new Error(`Integration token entropy must contain ${TOKEN_BYTES} bytes`);
  }
  const token = `${TOKEN_PREFIX}${Buffer.from(bytes).toString("base64url")}`;
  return {
    token,
    token_hash: hashIntegrationToken(token),
    token_last4: token.slice(-4)
  };
}

/** SHA-256 is intentionally deterministic so the private resolver uses its unique index. */
export function hashIntegrationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/**
 * Constant-time compare of two SHA-256 hex digests. Length is fixed by the
 * column check; a malformed value fails closed without throwing.
 */
export function integrationTokenHashesEqual(left: string, right: string): boolean {
  if (!HASH_HEX_PATTERN.test(left) || !HASH_HEX_PATTERN.test(right)) {
    return false;
  }
  return timingSafeEqual(Buffer.from(left, "utf8"), Buffer.from(right, "utf8"));
}

/**
 * The only pre-tenant lookup for incoming integration bearer tokens. It has
 * no cache: disabling a connection must take effect on the next request.
 */
export async function resolveWorkspaceByIntegrationToken(
  token: string,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedIntegrationWorkspace | null> {
  const token_hash = hashIntegrationToken(token);
  const rows = await prisma.$queryRaw<ResolvedIntegrationWorkspace[]>`
    SELECT workspace_id, integration_connection_id
    FROM private.resolve_workspace_by_token_hash(${token_hash})
  `;
  const row = rows[0];
  if (!row) {
    return null;
  }
  if (!HASH_HEX_PATTERN.test(token_hash)) {
    throw new Error("Integration token hash must be SHA-256 hexadecimal");
  }
  assertUuid(row.workspace_id, "workspace_id");
  assertUuid(row.integration_connection_id, "integration_connection_id");
  return row;
}
