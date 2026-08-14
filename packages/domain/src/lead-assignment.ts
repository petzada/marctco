export type AssignmentRole = "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER";

export interface AssignmentMember {
  readonly user_id: string;
  readonly role: AssignmentRole;
  readonly status: "ACTIVE" | "DETACHED";
  readonly tag_ids: readonly string[];
}

export type AssignmentDecision =
  | { readonly allowed: true }
  | {
      readonly allowed: false;
      readonly reason:
        | "ACTOR_CANNOT_ASSIGN"
        | "ACTOR_CANNOT_REASSIGN"
        | "DESTINATION_INACTIVE"
        | "DESTINATION_MUST_BE_SUPERVISOR_OR_SELF"
        | "SUPERVISOR_REQUIRES_TAG"
        | "CURRENT_OWNER_OUTSIDE_TEAM"
        | "DESTINATION_OUTSIDE_TEAM";
    };

function sharesTag(left: readonly string[], right: readonly string[]): boolean {
  const tags = new Set(left);
  return right.some((tag) => tags.has(tag));
}

export function decideLeadAssignment(input: Readonly<{
  actor: AssignmentMember;
  destination: AssignmentMember;
}>): AssignmentDecision {
  if (input.actor.role === "ATTENDANT" || input.actor.role === "SUPERVISOR") {
    return { allowed: false, reason: "ACTOR_CANNOT_ASSIGN" };
  }
  if (input.destination.status !== "ACTIVE") {
    return { allowed: false, reason: "DESTINATION_INACTIVE" };
  }
  if (input.destination.user_id === input.actor.user_id) {
    return { allowed: true };
  }
  if (input.destination.role !== "SUPERVISOR") {
    return { allowed: false, reason: "DESTINATION_MUST_BE_SUPERVISOR_OR_SELF" };
  }
  if (input.destination.tag_ids.length === 0) {
    return { allowed: false, reason: "SUPERVISOR_REQUIRES_TAG" };
  }
  return { allowed: true };
}

export function decideLeadReassignment(input: Readonly<{
  actor: AssignmentMember;
  currentOwner: AssignmentMember;
  destination: AssignmentMember;
}>): AssignmentDecision {
  if (input.actor.role === "ATTENDANT") {
    return { allowed: false, reason: "ACTOR_CANNOT_REASSIGN" };
  }
  if (input.destination.status !== "ACTIVE") {
    return { allowed: false, reason: "DESTINATION_INACTIVE" };
  }
  if (input.actor.role === "MANAGER" || input.actor.role === "OWNER") {
    return { allowed: true };
  }
  if (input.actor.tag_ids.length === 0) {
    return { allowed: false, reason: "SUPERVISOR_REQUIRES_TAG" };
  }
  if (input.currentOwner.status !== "ACTIVE" || !sharesTag(input.actor.tag_ids, input.currentOwner.tag_ids)) {
    return { allowed: false, reason: "CURRENT_OWNER_OUTSIDE_TEAM" };
  }
  if (!sharesTag(input.actor.tag_ids, input.destination.tag_ids)) {
    return { allowed: false, reason: "DESTINATION_OUTSIDE_TEAM" };
  }
  return { allowed: true };
}
