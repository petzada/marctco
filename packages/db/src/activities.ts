import { Prisma, type PrismaClient } from "@prisma/client";
import {
  decideActivityCreate,
  decideActivityTransition,
  isActivityType,
  type ActivityAssigneeMember,
  type ActivityStatus,
  type ActivityType
} from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { withAccessContext, type ScopedTransactionClient } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export type ActivityRefusal =
  | "OPPORTUNITY_NOT_VISIBLE"
  | "OPPORTUNITY_CLOSED"
  | "OPPORTUNITY_MERGED"
  | "ASSIGNEE_INACTIVE"
  | "ASSIGNEE_NOT_ALLOWED"
  | "ASSIGNEE_CANNOT_REACH_LEAD"
  | "ACTIVITY_NOT_VISIBLE"
  | "ALREADY_DONE"
  | "ALREADY_CANCELED"
  | "INVALID_TITLE"
  | "INVALID_TYPE"
  | "INVALID_DUE_AT"
  | "OPPORTUNITY_REQUIRED";

export class ActivityError extends Error {
  constructor(readonly reason: ActivityRefusal) {
    super(reason);
    this.name = "ActivityError";
  }
}

export interface LeadActivity {
  readonly id: string;
  readonly opportunity_id: string;
  readonly type: ActivityType;
  readonly title: string;
  readonly notes: string | null;
  readonly due_at: Date;
  readonly status: ActivityStatus;
  readonly assigned_user_id: string;
  readonly assigned_user_name: string | null;
  readonly created_by_user_id: string;
  readonly completed_at: Date | null;
  readonly completed_by_user_id: string | null;
  readonly completed_by_user_name: string | null;
  readonly canceled_at: Date | null;
  readonly created_at: Date;
}

export interface CreateActivityInput {
  readonly opportunity_id: string;
  readonly type: string;
  readonly title: string;
  readonly notes?: string | null;
  readonly due_at: Date;
  readonly assigned_user_id?: string;
}

export interface RescheduleActivityInput {
  readonly activity_id: string;
  readonly due_at: Date;
}

interface OpportunityForActivity {
  readonly id: string;
  readonly status: "OPEN" | "WON" | "LOST";
  readonly merged_into_opportunity_id: string | null;
  readonly assigned_user_id: string | null;
}

interface ActivityRow {
  readonly id: string;
  readonly opportunity_id: string;
  readonly type: string;
  readonly title: string;
  readonly notes: string | null;
  readonly due_at: Date;
  readonly status: string;
  readonly assigned_user_id: string;
  readonly assigned_user_name: string | null;
  readonly created_by_user_id: string;
  readonly completed_at: Date | null;
  readonly completed_by_user_id: string | null;
  readonly completed_by_user_name: string | null;
  readonly canceled_at: Date | null;
  readonly created_at: Date;
}

interface MemberRow {
  readonly user_id: string;
  readonly role: ActivityAssigneeMember["role"];
  readonly status: "ACTIVE" | "DETACHED";
  readonly tag_ids: string[];
}

function asActivity(row: ActivityRow): LeadActivity {
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    type: row.type as ActivityType,
    title: row.title,
    notes: row.notes,
    due_at: row.due_at,
    status: row.status as ActivityStatus,
    assigned_user_id: row.assigned_user_id,
    assigned_user_name: row.assigned_user_name,
    created_by_user_id: row.created_by_user_id,
    completed_at: row.completed_at,
    completed_by_user_id: row.completed_by_user_id,
    completed_by_user_name: row.completed_by_user_name,
    canceled_at: row.canceled_at,
    created_at: row.created_at
  };
}

function assertDueAt(value: Date): Date {
  if (!(value instanceof Date) || Number.isNaN(value.getTime())) {
    throw new ActivityError("INVALID_DUE_AT");
  }
  return value;
}

async function loadMembers(
  transaction: ScopedTransactionClient,
  workspace_id: string
): Promise<ActivityAssigneeMember[]> {
  const rows = await transaction.$queryRaw<MemberRow[]>(Prisma.sql`
    SELECT
      member.user_id,
      member.role::text AS role,
      member.status::text AS status,
      COALESCE(
        array_agg(applied.tag_id::text) FILTER (WHERE applied.tag_id IS NOT NULL),
        ARRAY[]::text[]
      ) AS tag_ids
    FROM workspace_members AS member
    LEFT JOIN member_tags AS applied
      ON applied.workspace_id = member.workspace_id
     AND applied.user_id = member.user_id
    WHERE member.workspace_id = ${workspace_id}::uuid
    GROUP BY member.user_id, member.role, member.status
  `);
  return rows.map((row) => ({
    user_id: row.user_id,
    role: row.role,
    status: row.status,
    tag_ids: row.tag_ids
  }));
}

async function loadOpportunityForActor(
  transaction: ScopedTransactionClient,
  context: UserContext,
  opportunity_id: string
): Promise<OpportunityForActivity | undefined> {
  const rows = await transaction.$queryRaw<OpportunityForActivity[]>(Prisma.sql`
    SELECT
      opportunity.id,
      opportunity.status::text AS status,
      opportunity.merged_into_opportunity_id,
      opportunity.assigned_user_id
    FROM opportunities AS opportunity
    WHERE opportunity.id = ${opportunity_id}::uuid
      AND opportunity.workspace_id = ${context.workspace_id}::uuid
      ${opportunityScopeSql(context, "opportunity")}
  `);
  return rows[0];
}

const ACTIVITY_SELECT = Prisma.sql`
  activity.id,
  activity.opportunity_id,
  activity.type::text AS type,
  activity.title,
  activity.notes,
  activity.due_at,
  activity.status::text AS status,
  activity.assigned_user_id,
  assigned.display_name AS assigned_user_name,
  activity.created_by_user_id,
  activity.completed_at,
  activity.completed_by_user_id,
  completed.display_name AS completed_by_user_name,
  activity.canceled_at,
  activity.created_at
`;

const ACTIVITY_JOINS = Prisma.sql`
  FROM activities AS activity
  JOIN opportunities AS opportunity
    ON opportunity.workspace_id = activity.workspace_id
   AND opportunity.id = activity.opportunity_id
  JOIN workspace_members AS assigned
    ON assigned.workspace_id = activity.workspace_id
   AND assigned.user_id = activity.assigned_user_id
  LEFT JOIN workspace_members AS completed
    ON completed.workspace_id = activity.workspace_id
   AND completed.user_id = activity.completed_by_user_id
`;

/**
 * Activities of one lead, in the Opportunity's profile scope — never a
 * second rule based on who is responsible (ADR-0015). A Supervisor without
 * a tag receives the empty set, not a refusal.
 */
export async function listLeadActivities(
  context: UserContext,
  opportunity_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<readonly LeadActivity[]> {
  assertUuid(opportunity_id, "opportunity_id");
  return withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<ActivityRow[]>(Prisma.sql`
      SELECT ${ACTIVITY_SELECT}
      ${ACTIVITY_JOINS}
      WHERE activity.workspace_id = ${context.workspace_id}::uuid
        AND activity.opportunity_id = ${opportunity_id}::uuid
        ${opportunityScopeSql(context, "opportunity")}
      ORDER BY
        (activity.status = 'OPEN'::activity_status) DESC,
        activity.due_at ASC,
        activity.id ASC
    `);
    return rows.map(asActivity);
  });
}

export async function createActivity(
  context: UserContext,
  input: CreateActivityInput,
  prisma: PrismaClient = sharedPrisma
): Promise<LeadActivity> {
  if (!input.opportunity_id) {
    throw new ActivityError("OPPORTUNITY_REQUIRED");
  }
  assertUuid(input.opportunity_id, "opportunity_id");
  const assigned_user_id = input.assigned_user_id ?? context.user_id;
  assertUuid(assigned_user_id, "assigned_user_id");
  if (!isActivityType(input.type)) {
    throw new ActivityError("INVALID_TYPE");
  }
  const title = input.title.trim();
  if (title.length === 0) {
    throw new ActivityError("INVALID_TITLE");
  }
  const due_at = assertDueAt(input.due_at);
  const notes = input.notes?.trim() ? input.notes.trim() : null;

  return withAccessContext(prisma, context, async (transaction) => {
    const opportunity = await loadOpportunityForActor(transaction, context, input.opportunity_id);
    if (!opportunity) {
      throw new ActivityError("OPPORTUNITY_NOT_VISIBLE");
    }
    const members = await loadMembers(transaction, context.workspace_id);
    const actor = members.find((member) => member.user_id === context.user_id);
    const assignee = members.find((member) => member.user_id === assigned_user_id);
    if (!actor) {
      throw new ActivityError("OPPORTUNITY_NOT_VISIBLE");
    }
    const decision = decideActivityCreate({ opportunity, actor, assignee, members });
    if (!decision.allowed) {
      throw new ActivityError(decision.reason);
    }

    const inserted = await transaction.$queryRaw<ActivityRow[]>(Prisma.sql`
      WITH created AS (
        INSERT INTO activities (
          workspace_id, opportunity_id, assigned_user_id, type, title, notes,
          due_at, status, created_by_user_id, updated_at
        )
        VALUES (
          ${context.workspace_id}::uuid,
          ${input.opportunity_id}::uuid,
          ${assigned_user_id}::uuid,
          ${input.type}::activity_type,
          ${title},
          ${notes},
          ${due_at},
          'OPEN'::activity_status,
          ${context.user_id}::uuid,
          CURRENT_TIMESTAMP
        )
        RETURNING *
      )
      SELECT ${ACTIVITY_SELECT}
      FROM created AS activity
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = activity.workspace_id
       AND opportunity.id = activity.opportunity_id
      JOIN workspace_members AS assigned
        ON assigned.workspace_id = activity.workspace_id
       AND assigned.user_id = activity.assigned_user_id
      LEFT JOIN workspace_members AS completed
        ON completed.workspace_id = activity.workspace_id
       AND completed.user_id = activity.completed_by_user_id
    `);
    const created = inserted[0];
    if (!created) {
      throw new ActivityError("OPPORTUNITY_NOT_VISIBLE");
    }
    return asActivity(created);
  });
}

async function loadActivityForActor(
  transaction: ScopedTransactionClient,
  context: UserContext,
  activity_id: string
): Promise<ActivityRow | undefined> {
  const rows = await transaction.$queryRaw<ActivityRow[]>(Prisma.sql`
    SELECT ${ACTIVITY_SELECT}
    ${ACTIVITY_JOINS}
    WHERE activity.workspace_id = ${context.workspace_id}::uuid
      AND activity.id = ${activity_id}::uuid
      ${opportunityScopeSql(context, "opportunity")}
  `);
  return rows[0];
}

async function refuseFailedTransition(
  transaction: ScopedTransactionClient,
  context: UserContext,
  activity_id: string
): Promise<never> {
  const current = await loadActivityForActor(transaction, context, activity_id);
  if (!current) {
    throw new ActivityError("ACTIVITY_NOT_VISIBLE");
  }
  if (current.status === "DONE") {
    throw new ActivityError("ALREADY_DONE");
  }
  throw new ActivityError("ALREADY_CANCELED");
}

export async function completeActivity(
  context: UserContext,
  activity_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<LeadActivity> {
  assertUuid(activity_id, "activity_id");
  return withAccessContext(prisma, context, async (transaction) => {
    const current = await loadActivityForActor(transaction, context, activity_id);
    if (!current) {
      throw new ActivityError("ACTIVITY_NOT_VISIBLE");
    }
    const decision = decideActivityTransition(current.status as ActivityStatus, "COMPLETE");
    if (!decision.allowed) {
      throw new ActivityError(decision.reason);
    }

    const updated = await transaction.$queryRaw<ActivityRow[]>(Prisma.sql`
      WITH done_rows AS (
        UPDATE activities AS activity
        SET
          status = 'DONE'::activity_status,
          completed_at = CURRENT_TIMESTAMP,
          completed_by_user_id = ${context.user_id}::uuid,
          updated_at = CURRENT_TIMESTAMP
        FROM opportunities AS opportunity
        WHERE activity.id = ${activity_id}::uuid
          AND activity.workspace_id = ${context.workspace_id}::uuid
          AND activity.status = 'OPEN'::activity_status
          AND opportunity.workspace_id = activity.workspace_id
          AND opportunity.id = activity.opportunity_id
          ${opportunityScopeSql(context, "opportunity")}
        RETURNING activity.*
      )
      SELECT ${ACTIVITY_SELECT}
      FROM done_rows AS activity
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = activity.workspace_id
       AND opportunity.id = activity.opportunity_id
      JOIN workspace_members AS assigned
        ON assigned.workspace_id = activity.workspace_id
       AND assigned.user_id = activity.assigned_user_id
      LEFT JOIN workspace_members AS completed
        ON completed.workspace_id = activity.workspace_id
       AND completed.user_id = activity.completed_by_user_id
    `);
    const completed = updated[0];
    if (!completed) {
      return refuseFailedTransition(transaction, context, activity_id);
    }
    return asActivity(completed);
  });
}

export async function cancelActivity(
  context: UserContext,
  activity_id: string,
  prisma: PrismaClient = sharedPrisma
): Promise<LeadActivity> {
  assertUuid(activity_id, "activity_id");
  return withAccessContext(prisma, context, async (transaction) => {
    const current = await loadActivityForActor(transaction, context, activity_id);
    if (!current) {
      throw new ActivityError("ACTIVITY_NOT_VISIBLE");
    }
    const decision = decideActivityTransition(current.status as ActivityStatus, "CANCEL");
    if (!decision.allowed) {
      throw new ActivityError(decision.reason);
    }

    const updated = await transaction.$queryRaw<ActivityRow[]>(Prisma.sql`
      WITH canceled AS (
        UPDATE activities AS activity
        SET
          status = 'CANCELED'::activity_status,
          canceled_at = CURRENT_TIMESTAMP,
          updated_at = CURRENT_TIMESTAMP
        FROM opportunities AS opportunity
        WHERE activity.id = ${activity_id}::uuid
          AND activity.workspace_id = ${context.workspace_id}::uuid
          AND activity.status = 'OPEN'::activity_status
          AND opportunity.workspace_id = activity.workspace_id
          AND opportunity.id = activity.opportunity_id
          ${opportunityScopeSql(context, "opportunity")}
        RETURNING activity.*
      )
      SELECT ${ACTIVITY_SELECT}
      FROM canceled AS activity
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = activity.workspace_id
       AND opportunity.id = activity.opportunity_id
      JOIN workspace_members AS assigned
        ON assigned.workspace_id = activity.workspace_id
       AND assigned.user_id = activity.assigned_user_id
      LEFT JOIN workspace_members AS completed
        ON completed.workspace_id = activity.workspace_id
       AND completed.user_id = activity.completed_by_user_id
    `);
    const canceled = updated[0];
    if (!canceled) {
      return refuseFailedTransition(transaction, context, activity_id);
    }
    return asActivity(canceled);
  });
}

export async function rescheduleActivity(
  context: UserContext,
  input: RescheduleActivityInput,
  prisma: PrismaClient = sharedPrisma
): Promise<LeadActivity> {
  assertUuid(input.activity_id, "activity_id");
  const due_at = assertDueAt(input.due_at);
  return withAccessContext(prisma, context, async (transaction) => {
    const current = await loadActivityForActor(transaction, context, input.activity_id);
    if (!current) {
      throw new ActivityError("ACTIVITY_NOT_VISIBLE");
    }
    const decision = decideActivityTransition(current.status as ActivityStatus, "RESCHEDULE");
    if (!decision.allowed) {
      throw new ActivityError(decision.reason);
    }

    const updated = await transaction.$queryRaw<ActivityRow[]>(Prisma.sql`
      WITH rescheduled AS (
        UPDATE activities AS activity
        SET due_at = ${due_at}, updated_at = CURRENT_TIMESTAMP
        FROM opportunities AS opportunity
        WHERE activity.id = ${input.activity_id}::uuid
          AND activity.workspace_id = ${context.workspace_id}::uuid
          AND activity.status = 'OPEN'::activity_status
          AND opportunity.workspace_id = activity.workspace_id
          AND opportunity.id = activity.opportunity_id
          ${opportunityScopeSql(context, "opportunity")}
        RETURNING activity.*
      )
      SELECT ${ACTIVITY_SELECT}
      FROM rescheduled AS activity
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = activity.workspace_id
       AND opportunity.id = activity.opportunity_id
      JOIN workspace_members AS assigned
        ON assigned.workspace_id = activity.workspace_id
       AND assigned.user_id = activity.assigned_user_id
      LEFT JOIN workspace_members AS completed
        ON completed.workspace_id = activity.workspace_id
       AND completed.user_id = activity.completed_by_user_id
    `);
    const rescheduled = updated[0];
    if (!rescheduled) {
      return refuseFailedTransition(transaction, context, input.activity_id);
    }
    return asActivity(rescheduled);
  });
}
