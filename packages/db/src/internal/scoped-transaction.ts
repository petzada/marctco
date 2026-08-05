import type { Prisma, PrismaClient } from "@prisma/client";
import { WorkspaceRole, type AccessContext } from "../access-context.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const KNOWN_ROLES: ReadonlySet<string> = new Set(Object.values(WorkspaceRole));

export type ScopedTransactionClient = Prisma.TransactionClient;

export type ScopedWork<Context extends AccessContext, Result> = (
  transaction: ScopedTransactionClient,
  context: Context
) => Promise<Result>;

/**
 * The single path from a named operation in packages/db to Postgres
 * (ADR-0016, ADR-0006 regra 5). Every operation — present and future — opens
 * its transaction here, never through `prisma.$transaction` called directly,
 * so `SET LOCAL app.workspace_id` and the fail-closed role check cannot be
 * skipped by a chamador in a hurry.
 *
 * `SET LOCAL`, never `SET`: the setting is transaction-scoped, so it cannot
 * survive into the next borrower of a pooled connection under
 * transaction-mode pgbouncer (ADR-0006 regra 5). Prisma has no bind
 * parameter for a configuration value in a `SET` statement — the value is
 * validated as a UUID (or a known role) before it is interpolated, the same
 * defense already exercised in packages/db/tests/rls.test.ts.
 *
 * This module is internal to packages/db: `work` receives the raw
 * transaction client, and only code that already lives inside this package
 * is allowed to call this function (enforced by `no-restricted-imports` and
 * `scripts/check-prisma-imports.mjs`, ADR-0016).
 */
export async function withAccessContext<Context extends AccessContext, Result>(
  client: PrismaClient,
  context: Context,
  work: ScopedWork<Context, Result>
): Promise<Result> {
  assertUuid(context.workspace_id, "AccessContext.workspace_id");
  if (context.kind === "user" && !KNOWN_ROLES.has(context.role)) {
    // Defense in depth: createUserContext already refuses an unknown role.
    // This only fires if a context somehow reached here without going
    // through that constructor, and it fails closed rather than scoping to
    // nothing.
    throw new Error(
      `Refusing to open a scoped transaction: unknown role ${JSON.stringify(context.role)}`
    );
  }

  return client.$transaction(async (transaction) => {
    await transaction.$executeRawUnsafe(
      `SET LOCAL app.workspace_id = '${context.workspace_id}'`
    );
    return work(transaction, context);
  });
}

function assertUuid(value: string, label: string): void {
  if (typeof value !== "string" || !UUID_PATTERN.test(value)) {
    throw new Error(`${label} must be a UUID, received: ${JSON.stringify(value)}`);
  }
}
