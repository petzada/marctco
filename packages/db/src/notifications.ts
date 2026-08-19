import { Prisma, type PrismaClient } from "@prisma/client";
import { canActOnManagementNotifications } from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { assertUuid } from "./internal/uuid.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export type NotificationRefusal = "FORBIDDEN" | "NOT_VISIBLE";

export class NotificationError extends Error {
  constructor(readonly reason: NotificationRefusal) {
    super(reason);
    this.name = "NotificationError";
  }
}

export interface MarkNotificationReadInput {
  readonly notification_id: string;
  readonly now: Date;
}

export interface MarkedNotificationRead {
  readonly id: string;
  readonly opportunity_id: string;
  readonly type: string;
  readonly read_at: Date;
  readonly read_by_user_id: string;
  readonly resolved_at: Date | null;
}

interface MarkedRow {
  readonly id: string;
  readonly opportunity_id: string;
  readonly type: string;
  readonly read_at: Date;
  readonly read_by_user_id: string;
  readonly resolved_at: Date | null;
}

/**
 * Marks a management notification as read. Does not resolve it: the cause
 * may still be burning. Atendente is refused; Supervisor is scoped to the
 * team; Gestão and Direção see the workspace.
 */
export async function markNotificationRead(
  context: UserContext,
  input: MarkNotificationReadInput,
  prisma: PrismaClient = sharedPrisma
): Promise<MarkedNotificationRead> {
  if (!canActOnManagementNotifications(context.role)) {
    throw new NotificationError("FORBIDDEN");
  }
  assertUuid(input.notification_id, "notification_id");
  if (Number.isNaN(input.now.getTime())) {
    throw new Error("markNotificationRead requires a valid instant");
  }

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<MarkedRow[]>(Prisma.sql`
      UPDATE notifications AS notice
      SET
        read_at = ${input.now}::timestamptz,
        read_by_user_id = ${context.user_id}::uuid
      FROM opportunities AS opportunity
      WHERE notice.id = ${input.notification_id}::uuid
        AND notice.workspace_id = ${context.workspace_id}::uuid
        AND opportunity.workspace_id = notice.workspace_id
        AND opportunity.id = notice.opportunity_id
        ${opportunityScopeSql(context, "opportunity")}
      RETURNING
        notice.id,
        notice.opportunity_id,
        notice.type::text AS type,
        notice.read_at,
        notice.read_by_user_id,
        notice.resolved_at
    `)
  );

  const row = rows[0];
  if (!row) {
    throw new NotificationError("NOT_VISIBLE");
  }
  return row;
}
