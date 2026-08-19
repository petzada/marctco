import { Prisma, type PrismaClient } from "@prisma/client";
import { parseAgendaInterval, type ActivityStatus, type ActivityType } from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { withAccessContext } from "./internal/scoped-transaction.js";
import { assertUuid } from "./internal/uuid.js";

const sharedPrisma = createPrismaClient();

export type AgendaRefusal = "INVALID_RANGE" | "RANGE_TOO_LONG";

export class AgendaError extends Error {
  constructor(readonly reason: AgendaRefusal) {
    super(reason);
    this.name = "AgendaError";
  }
}

export interface ListAgendaOptions {
  readonly from: Date;
  readonly to: Date;
  readonly responsible_user_id?: string;
  readonly tag_id?: string;
  readonly pipeline_id?: string;
  /** When true, returns every overdue OPEN activity in scope, ignoring the interval. */
  readonly overdue_only?: boolean;
  readonly now?: Date;
}

export interface AgendaItem {
  readonly id: string;
  readonly opportunity_id: string;
  readonly person_name: string;
  readonly pipeline_id: string;
  readonly pipeline_name: string;
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

export interface AgendaTagOption {
  readonly id: string;
  readonly name: string;
}

export interface AgendaPipelineOption {
  readonly id: string;
  readonly name: string;
}

/**
 * The Agenda screen's only query. Interval and filters arrive already
 * decided; the page never assembles a `where`. Access is the Opportunity's
 * profile scope — never a second rule based on who is responsible for the
 * activity (ADR-0015). Filters only narrow that set: a Supervisor asking
 * for another team's tag receives empty, not a refusal.
 */
export interface AgendaView {
  readonly items: readonly AgendaItem[];
  readonly tags: readonly AgendaTagOption[];
  readonly pipelines: readonly AgendaPipelineOption[];
}

interface AgendaItemRow {
  readonly id: string;
  readonly opportunity_id: string;
  readonly person_name: string;
  readonly pipeline_id: string;
  readonly pipeline_name: string;
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

function asAgendaItem(row: AgendaItemRow): AgendaItem {
  return {
    id: row.id,
    opportunity_id: row.opportunity_id,
    person_name: row.person_name,
    pipeline_id: row.pipeline_id,
    pipeline_name: row.pipeline_name,
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

export async function listAgenda(
  context: UserContext,
  options: ListAgendaOptions,
  prisma: PrismaClient = sharedPrisma
): Promise<AgendaView> {
  const interval = parseAgendaInterval({ from: options.from, to: options.to });
  if (!interval.ok) {
    throw new AgendaError(interval.reason);
  }
  if (options.responsible_user_id) {
    assertUuid(options.responsible_user_id, "responsible_user_id");
  }
  if (options.tag_id) {
    assertUuid(options.tag_id, "tag_id");
  }
  if (options.pipeline_id) {
    assertUuid(options.pipeline_id, "pipeline_id");
  }

  const responsibleFilter = options.responsible_user_id
    ? Prisma.sql`AND activity.assigned_user_id = ${options.responsible_user_id}::uuid`
    : Prisma.empty;
  const tagFilter = options.tag_id
    ? Prisma.sql`
        AND EXISTS (
          SELECT 1
          FROM member_tags AS filtered_member_tag
          WHERE filtered_member_tag.workspace_id = opportunity.workspace_id
            AND filtered_member_tag.user_id = opportunity.assigned_user_id
            AND filtered_member_tag.tag_id = ${options.tag_id}::uuid
        )
      `
    : Prisma.empty;
  const pipelineFilter = options.pipeline_id
    ? Prisma.sql`AND opportunity.pipeline_id = ${options.pipeline_id}::uuid`
    : Prisma.empty;

  const now = options.now ?? new Date();
  if (options.overdue_only && Number.isNaN(now.getTime())) {
    throw new Error("now must be a valid instant when filtering overdue activities");
  }
  const dueFilter = options.overdue_only
    ? Prisma.sql`
        AND activity.status = 'OPEN'::activity_status
        AND activity.due_at < ${now}::timestamptz
      `
    : Prisma.sql`
        AND activity.due_at >= ${interval.from}
        AND activity.due_at < ${interval.to}
      `;

  return withAccessContext(prisma, context, async (transaction) => {
    const items = await transaction.$queryRaw<AgendaItemRow[]>(Prisma.sql`
        SELECT
          activity.id,
          activity.opportunity_id,
          person.name AS person_name,
          pipeline.id AS pipeline_id,
          pipeline.name AS pipeline_name,
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
        FROM activities AS activity
        JOIN opportunities AS opportunity
          ON opportunity.workspace_id = activity.workspace_id
         AND opportunity.id = activity.opportunity_id
        JOIN persons AS person
          ON person.workspace_id = opportunity.workspace_id
         AND person.id = opportunity.person_id
        JOIN pipelines AS pipeline
          ON pipeline.workspace_id = opportunity.workspace_id
         AND pipeline.id = opportunity.pipeline_id
        JOIN workspace_members AS assigned
          ON assigned.workspace_id = activity.workspace_id
         AND assigned.user_id = activity.assigned_user_id
        LEFT JOIN workspace_members AS completed
          ON completed.workspace_id = activity.workspace_id
         AND completed.user_id = activity.completed_by_user_id
        WHERE activity.workspace_id = ${context.workspace_id}::uuid
          AND opportunity.merged_into_opportunity_id IS NULL
          AND activity.status <> 'CANCELED'::activity_status
          ${dueFilter}
          ${opportunityScopeSql(context, "opportunity")}
          ${responsibleFilter}
          ${tagFilter}
          ${pipelineFilter}
        ORDER BY
          activity.due_at ASC,
          activity.id ASC
      `);
    const tags = await transaction.$queryRaw<AgendaTagOption[]>(Prisma.sql`
      SELECT id, name
      FROM tags
      WHERE workspace_id = ${context.workspace_id}::uuid
      ORDER BY lower(name), name
    `);
    const pipelines = await transaction.$queryRaw<AgendaPipelineOption[]>(Prisma.sql`
      SELECT id, name
      FROM pipelines
      WHERE workspace_id = ${context.workspace_id}::uuid
      ORDER BY type::text, name
    `);
    return {
      items: items.map(asAgendaItem),
      tags,
      pipelines
    };
  });
}
