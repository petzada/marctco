import { Prisma, type PrismaClient } from "@prisma/client";
import {
  canActOnManagementNotifications,
  NOTIFICATION_TYPES,
  type NotificationType
} from "@marctco/domain";
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

export interface UnresolvedNotification {
  readonly id: string;
  readonly opportunity_id: string;
  readonly person_name: string;
  readonly type: NotificationType;
  readonly detected_at: Date;
  readonly read_at: Date | null;
}

export interface UnresolvedNotificationList {
  readonly items: readonly UnresolvedNotification[];
}

interface MarkedRow {
  readonly id: string;
  readonly opportunity_id: string;
  readonly type: string;
  readonly read_at: Date;
  readonly read_by_user_id: string;
  readonly resolved_at: Date | null;
}

interface UnresolvedRow {
  readonly id: string;
  readonly opportunity_id: string;
  readonly person_name: string;
  readonly type: string;
  readonly detected_at: Date;
  readonly read_at: Date | null;
}

function asNotificationType(value: string): NotificationType {
  if ((NOTIFICATION_TYPES as readonly string[]).includes(value)) {
    return value as NotificationType;
  }
  throw new Error(`Unknown notification type: ${JSON.stringify(value)}`);
}

function asUnresolvedNotification(row: UnresolvedRow): UnresolvedNotification {
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    person_name: row.person_name,
    type: asNotificationType(row.type),
    detected_at: row.detected_at,
    read_at: row.read_at
  };
}

/**
 * Unresolved management notices in the actor's profile scope. Atendente is
 * refused; Supervisor is the team (empty without a tag); Gestão and Direção
 * see the workspace. Tenant isolation stays in RLS plus `workspace_id`.
 */
export async function listUnresolvedNotifications(
  context: UserContext,
  prisma: PrismaClient = sharedPrisma
): Promise<UnresolvedNotificationList> {
  if (!canActOnManagementNotifications(context.role)) {
    throw new NotificationError("FORBIDDEN");
  }

  const rows = await withAccessContext(prisma, context, async (transaction) =>
    transaction.$queryRaw<UnresolvedRow[]>(Prisma.sql`
      SELECT
        notice.id,
        notice.opportunity_id,
        person.name AS person_name,
        notice.type::text AS type,
        notice.detected_at,
        notice.read_at
      FROM notifications AS notice
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = notice.workspace_id
       AND opportunity.id = notice.opportunity_id
      JOIN persons AS person
        ON person.workspace_id = opportunity.workspace_id
       AND person.id = opportunity.person_id
      WHERE notice.workspace_id = ${context.workspace_id}::uuid
        AND notice.resolved_at IS NULL
        ${opportunityScopeSql(context, "opportunity")}
      ORDER BY
        notice.detected_at DESC,
        notice.id DESC
    `)
  );

  return { items: rows.map(asUnresolvedNotification) };
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
