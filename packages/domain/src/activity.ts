import { teamUserIds, type TeamScopeMember } from "./team-scope.js";

export const ACTIVITY_TYPES = ["CALL", "MESSAGE", "MEETING", "TASK"] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export const ACTIVITY_STATUSES = ["OPEN", "DONE", "CANCELED"] as const;
export type ActivityStatus = (typeof ACTIVITY_STATUSES)[number];

export type ActivityActorRole = "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER";

export interface ActivityAssigneeMember extends TeamScopeMember {
  readonly role: ActivityActorRole;
}

export type ActivityCreateRefusal =
  | "OPPORTUNITY_CLOSED"
  | "OPPORTUNITY_MERGED"
  | "ASSIGNEE_INACTIVE"
  | "ASSIGNEE_NOT_ALLOWED"
  | "ASSIGNEE_CANNOT_REACH_LEAD";

export type ActivityCreateDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: ActivityCreateRefusal };

export type ActivityTransitionAction = "COMPLETE" | "CANCEL" | "RESCHEDULE";

export type ActivityTransitionRefusal = "ALREADY_DONE" | "ALREADY_CANCELED";

export type ActivityTransitionDecision =
  | { readonly allowed: true }
  | { readonly allowed: false; readonly reason: ActivityTransitionRefusal };

export function isActivityType(value: string): value is ActivityType {
  return (ACTIVITY_TYPES as readonly string[]).includes(value);
}

/**
 * Who this actor may designate as the activity's responsible, in the same
 * set shape as `teamUserIds`. Attendant: self. Supervisor with tags: the
 * team. Supervisor without tags: self (not an empty team). Gestão and
 * Direção: every ACTIVE member.
 */
export function activityAssigneeUserIds(
  actor: ActivityAssigneeMember,
  members: readonly ActivityAssigneeMember[]
): ReadonlySet<string> {
  if (actor.status !== "ACTIVE") {
    return new Set();
  }
  switch (actor.role) {
    case "ATTENDANT":
      return new Set([actor.user_id]);
    case "SUPERVISOR":
      if (actor.tag_ids.length === 0) {
        return new Set([actor.user_id]);
      }
      return teamUserIds(actor.tag_ids, members);
    case "MANAGER":
    case "OWNER":
      return new Set(
        members.flatMap((member) => (member.status === "ACTIVE" ? [member.user_id] : []))
      );
    default: {
      const unknownRole: never = actor.role;
      throw new Error(`Unknown workspace role, refusing activity assignees: ${JSON.stringify(unknownRole)}`);
    }
  }
}

/**
 * The activity's access unit is the Opportunity it belongs to — the same
 * profile scope the Fase 2 Leads table already applies, never a second
 * rule based on who is responsible for the activity.
 */
export function memberReachesOpportunity(input: Readonly<{
  member: ActivityAssigneeMember;
  members: readonly ActivityAssigneeMember[];
  opportunity: Readonly<{ assigned_user_id: string | null }>;
}>): boolean {
  if (input.member.status !== "ACTIVE") {
    return false;
  }
  switch (input.member.role) {
    case "ATTENDANT":
      return input.opportunity.assigned_user_id === input.member.user_id;
    case "SUPERVISOR": {
      const team = teamUserIds(input.member.tag_ids, input.members);
      return (
        input.opportunity.assigned_user_id !== null
        && team.has(input.opportunity.assigned_user_id)
      );
    }
    case "MANAGER":
    case "OWNER":
      return true;
    default: {
      const unknownRole: never = input.member.role;
      throw new Error(`Unknown workspace role, refusing Opportunity reach: ${JSON.stringify(unknownRole)}`);
    }
  }
}

export function decideActivityCreate(input: Readonly<{
  opportunity: Readonly<{
    status: "OPEN" | "WON" | "LOST";
    merged_into_opportunity_id: string | null;
    assigned_user_id: string | null;
  }>;
  actor: ActivityAssigneeMember;
  assignee: ActivityAssigneeMember | undefined;
  members: readonly ActivityAssigneeMember[];
}>): ActivityCreateDecision {
  if (input.opportunity.merged_into_opportunity_id !== null) {
    return { allowed: false, reason: "OPPORTUNITY_MERGED" };
  }
  if (input.opportunity.status !== "OPEN") {
    return { allowed: false, reason: "OPPORTUNITY_CLOSED" };
  }
  if (!input.assignee || input.assignee.status !== "ACTIVE") {
    return { allowed: false, reason: "ASSIGNEE_INACTIVE" };
  }
  if (!activityAssigneeUserIds(input.actor, input.members).has(input.assignee.user_id)) {
    return { allowed: false, reason: "ASSIGNEE_NOT_ALLOWED" };
  }
  if (
    !memberReachesOpportunity({
      member: input.assignee,
      members: input.members,
      opportunity: input.opportunity
    })
  ) {
    return { allowed: false, reason: "ASSIGNEE_CANNOT_REACH_LEAD" };
  }
  return { allowed: true };
}

export function decideActivityTransition(
  status: ActivityStatus,
  action: ActivityTransitionAction
): ActivityTransitionDecision {
  void action;
  if (status === "DONE") {
    return { allowed: false, reason: "ALREADY_DONE" };
  }
  if (status === "CANCELED") {
    return { allowed: false, reason: "ALREADY_CANCELED" };
  }
  return { allowed: true };
}

export function isActivityOverdue(input: Readonly<{
  status: ActivityStatus;
  due_at: Date;
  now: Date;
}>): boolean {
  return input.status === "OPEN" && input.due_at.getTime() < input.now.getTime();
}
