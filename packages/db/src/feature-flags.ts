import type { PrismaClient } from "@prisma/client";
import {
  resolveFeatureFlags,
  type FeatureFlag,
  type ResolvedFeatureFlags
} from "@marctco/domain/feature-flags";
import type { AccessContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

interface WorkspaceFlagRow {
  readonly key: string;
}

/**
 * Resolves only the workspace carried by the mandatory AccessContext. The
 * explicit predicate is defense in depth beside RLS; there is no environment
 * fallback and no resolved value survives this call in module state.
 */
export async function readWorkspaceFeatureFlags(
  context: AccessContext,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedFeatureFlags> {
  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<WorkspaceFlagRow[]>`
      SELECT key
      FROM workspace_flags
      WHERE workspace_id = ${context.workspace_id}::uuid
    `
  );
  return resolveFeatureFlags(rows.map((row) => row.key));
}

export class FeatureDisabledError extends Error {
  readonly code = "FEATURE_DISABLED";

  constructor(readonly flag: FeatureFlag) {
    super(`Feature ${flag} is disabled for this workspace`);
    this.name = "FeatureDisabledError";
  }
}

/**
 * Server-side capability guard for routes, queries and jobs. UI visibility is
 * never authoritative: the operation that spends money calls this itself.
 */
export async function assertWorkspaceFeatureEnabled(
  context: AccessContext,
  flag: FeatureFlag,
  prisma: PrismaClient = sharedPrisma
): Promise<void> {
  const resolved = await readWorkspaceFeatureFlags(context, prisma);
  if (!resolved[flag]) {
    throw new FeatureDisabledError(flag);
  }
}
