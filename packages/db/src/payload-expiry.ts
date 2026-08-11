import type { PrismaClient } from "@prisma/client";
import type { JobContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { PAYLOAD_RETENTION_DAYS } from "./integration-event.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();
const MAX_EXPIRY_BATCH = 500;
const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The instant before which a payload has outlived its three uses (ADR-0014).
 * Derived from `received_at + PAYLOAD_RETENTION_DAYS` inverted, so the sweep
 * and the screen's "expirou em" never disagree about the same 90 days.
 */
export function payloadExpiryCutoff(now: Date): Date {
  if (Number.isNaN(now.getTime())) {
    throw new Error("payloadExpiryCutoff requires a valid instant");
  }
  return new Date(now.getTime() - PAYLOAD_RETENTION_DAYS * DAY_MS);
}

/**
 * A tenant with at least one event old enough to expire, and the oldest of
 * those events.
 *
 * The anchor exists so the sweep can open its transaction with a real
 * `JobContext` — the tenant-scoped work is the same shape as the worker's, and
 * inventing a third kind of `AccessContext` for a maintenance pass would give
 * the one process that touches every tenant a context whose fail-closed check
 * nothing else exercises (ADR-0016).
 */
export interface ExpiringPayloadWorkspace {
  readonly workspace_id: string;
  readonly anchor_integration_event_id: string;
}

/**
 * Discovery, and the only part of the expiry routine without a tenant. It is
 * circular for the same reason `claimPendingIntegrationEvents` is: to set
 * `app.workspace_id` the sweep needs the `workspace_id` that only the read
 * reveals (ADR-0006 regra 9, ADR-0019).
 *
 * The private function answers with tenant ids and one event id — never a
 * payload, which it has no privilege to read even if someone edited its body
 * to try.
 */
export async function claimWorkspacesWithExpiringPayloads(
  now: Date,
  prisma: PrismaClient = sharedPrisma
): Promise<ExpiringPayloadWorkspace[]> {
  const cutoff = payloadExpiryCutoff(now);
  return prisma.$queryRaw<ExpiringPayloadWorkspace[]>`
    SELECT workspace_id, anchor_integration_event_id
    FROM private.claim_expired_payload_workspaces(${cutoff}::timestamptz)
  `;
}

export interface ExpirePayloadsInput {
  readonly now: Date;
  readonly batch_size: number;
}

/**
 * Clears the content of one batch of expired payloads in one tenant, under
 * RLS, in its own transaction — "em lotes, sem prender transação longa"
 * (ADR-0014). The caller loops until this returns zero.
 *
 * The row stays. Origin, instant, dispatch state and processing state keep
 * answering "quantos leads entraram, de onde, quantos falharam"; only the
 * personal content leaves, and `raw IS NULL` keeps having exactly one meaning.
 *
 * A quarantined event is skipped: it is precisely the payload a manager still
 * has to read to complete and release the lead, and expiring it would turn a
 * pending item into a permanent hole (ADR-0014, exceção dura).
 */
export async function expireIntegrationEventPayloads(
  context: JobContext,
  input: ExpirePayloadsInput,
  prisma: PrismaClient = sharedPrisma
): Promise<number> {
  if (
    !Number.isInteger(input.batch_size) ||
    input.batch_size < 1 ||
    input.batch_size > MAX_EXPIRY_BATCH
  ) {
    throw new Error(`batch_size must be an integer between 1 and ${MAX_EXPIRY_BATCH}`);
  }
  const cutoff = payloadExpiryCutoff(input.now);

  return withAccessContext(prisma, context, async (transaction) =>
    transaction.$executeRaw`
      UPDATE integration_events
      SET raw = NULL,
          updated_at = CURRENT_TIMESTAMP
      WHERE workspace_id = ${context.workspace_id}::uuid
        AND id IN (
          SELECT id
          FROM integration_events
          WHERE workspace_id = ${context.workspace_id}::uuid
            AND received_at < ${cutoff}::timestamptz
            AND raw IS NOT NULL
            AND status <> 'QUARANTINED'
          ORDER BY received_at, id
          LIMIT ${input.batch_size}::integer
        )
    `
  );
}
