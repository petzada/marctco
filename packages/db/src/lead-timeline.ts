import { Prisma, type PrismaClient } from "@prisma/client";
import type {
  LeadSource as PrismaLeadSource,
  OpportunityTimelineEventType as PrismaOpportunityTimelineEventType
} from "@prisma/client";
import { isActivityType, type ActivityType } from "@marctco/domain";
import type { UserContext } from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";
import { opportunityScopeSql } from "./internal/opportunity-scope.js";
import { withAccessContext } from "./internal/scoped-transaction.js";

const sharedPrisma = createPrismaClient();

export const DEFAULT_TIMELINE_LIMIT = 50;
export const MAX_TIMELINE_LIMIT = 50;

export type OpportunityTimelineEventType = PrismaOpportunityTimelineEventType;

export interface ListLeadTimelineOptions {
  readonly limit?: number;
}

export interface LeadTimelineFact {
  readonly id: string;
  readonly type: OpportunityTimelineEventType;
  readonly occurred_at: Date;
  readonly previous_assigned_user_name: string | null;
  readonly assigned_user_name: string | null;
  readonly activity_title: string | null;
  readonly activity_type: ActivityType | null;
  readonly activity_actor_name: string | null;
  readonly ingestion_source: PrismaLeadSource | null;
}

export interface LeadTimelinePage {
  readonly facts: readonly LeadTimelineFact[];
  readonly has_more: boolean;
}

interface TimelineRow {
  readonly id: string;
  readonly type: string;
  readonly occurred_at: Date;
  readonly previous_assigned_user_name: string | null;
  readonly assigned_user_name: string | null;
  readonly activity_title: string | null;
  readonly activity_type: string | null;
  readonly activity_actor_name: string | null;
  readonly ingestion_source: string | null;
}

const MEMBER_NAME = Prisma.sql`
  COALESCE(
    NULLIF(BTRIM(member.display_name), ''),
    NULLIF(BTRIM(member.email), '')
  )
`;

const ASSIGNED_MEMBER_NAME = Prisma.sql`
  COALESCE(
    NULLIF(BTRIM(assigned_member.display_name), ''),
    NULLIF(BTRIM(assigned_member.email), '')
  )
`;

const PREVIOUS_MEMBER_NAME = Prisma.sql`
  COALESCE(
    NULLIF(BTRIM(previous_member.display_name), ''),
    NULLIF(BTRIM(previous_member.email), '')
  )
`;

function asFact(row: TimelineRow): LeadTimelineFact {
  return {
    id: row.id,
    type: row.type as OpportunityTimelineEventType,
    occurred_at: row.occurred_at,
    previous_assigned_user_name: row.previous_assigned_user_name,
    assigned_user_name: row.assigned_user_name,
    activity_title: row.activity_title,
    activity_type: row.activity_type !== null && isActivityType(row.activity_type) ? row.activity_type : null,
    activity_actor_name: row.activity_actor_name,
    ingestion_source: row.ingestion_source as PrismaLeadSource | null
  };
}

/**
 * The lead card's timeline: facts already recorded on the Opportunity, in
 * profile scope (ADR-0015). Newest facts are capped so a years-long history
 * cannot ride in on one Server Component render. Assignment names come from
 * the ids frozen on each fact, resolved through `WorkspaceMember`, never
 * reconstructed from today's card owner.
 */
export async function listLeadTimeline(
  context: UserContext,
  opportunity_id: string,
  options: ListLeadTimelineOptions = {},
  prisma: PrismaClient = sharedPrisma
): Promise<LeadTimelinePage> {
  assertUuid(opportunity_id, "opportunity_id");
  const limit = options.limit ?? DEFAULT_TIMELINE_LIMIT;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_TIMELINE_LIMIT) {
    throw new Error(`limit must be an integer between 1 and ${MAX_TIMELINE_LIMIT}`);
  }

  return withAccessContext(prisma, context, async (transaction) => {
    const rows = await transaction.$queryRaw<TimelineRow[]>(Prisma.sql`
      SELECT
        event.id,
        event.type::text AS type,
        event.occurred_at,
        ${PREVIOUS_MEMBER_NAME} AS previous_assigned_user_name,
        ${ASSIGNED_MEMBER_NAME} AS assigned_user_name,
        CASE
          WHEN event.type = 'ACTIVITY_CREATED'::opportunity_timeline_event_type
          THEN created_activity.title
          WHEN event.type = 'ACTIVITY_COMPLETED'::opportunity_timeline_event_type
          THEN completed_activity.title
          ELSE NULL
        END AS activity_title,
        CASE
          WHEN event.type = 'ACTIVITY_CREATED'::opportunity_timeline_event_type
          THEN created_activity.type
          WHEN event.type = 'ACTIVITY_COMPLETED'::opportunity_timeline_event_type
          THEN completed_activity.type
          ELSE NULL
        END AS activity_type,
        CASE
          WHEN event.type = 'ACTIVITY_CREATED'::opportunity_timeline_event_type
          THEN created_activity.actor_name
          WHEN event.type = 'ACTIVITY_COMPLETED'::opportunity_timeline_event_type
          THEN completed_activity.actor_name
          ELSE NULL
        END AS activity_actor_name,
        CASE
          WHEN event.type IN (
            'RETRANSMISSION_RECEIVED'::opportunity_timeline_event_type,
            'SUBMISSION_REENTERED'::opportunity_timeline_event_type
          )
          THEN submission.source::text
          ELSE NULL
        END AS ingestion_source
      FROM opportunity_timeline_events AS event
      JOIN opportunities AS opportunity
        ON opportunity.workspace_id = event.workspace_id
       AND opportunity.id = event.opportunity_id
      LEFT JOIN workspace_members AS assigned_member
        ON assigned_member.workspace_id = event.workspace_id
       AND assigned_member.user_id = event.assigned_user_id
      LEFT JOIN workspace_members AS previous_member
        ON previous_member.workspace_id = event.workspace_id
       AND previous_member.user_id = event.previous_assigned_user_id
      LEFT JOIN LATERAL (
        SELECT
          activity.title,
          activity.type::text AS type,
          ${MEMBER_NAME} AS actor_name
        FROM activities AS activity
        JOIN workspace_members AS member
          ON member.workspace_id = activity.workspace_id
         AND member.user_id = activity.created_by_user_id
        WHERE event.type = 'ACTIVITY_CREATED'::opportunity_timeline_event_type
          AND activity.workspace_id = event.workspace_id
          AND activity.opportunity_id = event.opportunity_id
          AND activity.created_at = event.occurred_at
        ORDER BY activity.id
        LIMIT 1
      ) AS created_activity ON true
      LEFT JOIN LATERAL (
        SELECT
          activity.title,
          activity.type::text AS type,
          ${MEMBER_NAME} AS actor_name
        FROM activities AS activity
        LEFT JOIN workspace_members AS member
          ON member.workspace_id = activity.workspace_id
         AND member.user_id = activity.completed_by_user_id
        WHERE event.type = 'ACTIVITY_COMPLETED'::opportunity_timeline_event_type
          AND activity.workspace_id = event.workspace_id
          AND activity.opportunity_id = event.opportunity_id
          AND activity.completed_at = event.occurred_at
        ORDER BY activity.id
        LIMIT 1
      ) AS completed_activity ON true
      LEFT JOIN lead_submissions AS submission
        ON submission.workspace_id = event.workspace_id
       AND submission.id = event.lead_submission_id
      WHERE event.workspace_id = ${context.workspace_id}::uuid
        AND event.opportunity_id = ${opportunity_id}::uuid
        AND opportunity.merged_into_opportunity_id IS NULL
        ${opportunityScopeSql(context, "opportunity")}
      ORDER BY event.occurred_at DESC, event.id DESC
      LIMIT ${limit + 1}
    `);

    const has_more = rows.length > limit;
    const window = has_more ? rows.slice(0, limit) : rows;
    const facts = window.slice().reverse().map(asFact);
    return { facts, has_more };
  });
}
