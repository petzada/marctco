export interface TeamScopeMember {
  readonly user_id: string;
  readonly status: "ACTIVE" | "DETACHED";
  readonly tag_ids: readonly string[];
}

/**
 * Computes the Supervisor's team from member tags (ADR-0020). An untagged
 * Supervisor has no team; detached and untagged members never enter the set.
 */
export function teamUserIds(
  actor_tag_ids: readonly string[],
  members: readonly TeamScopeMember[]
): ReadonlySet<string> {
  if (actor_tag_ids.length === 0) {
    return new Set();
  }

  const actorTags = new Set(actor_tag_ids);
  const userIds = new Set<string>();
  for (const member of members) {
    if (
      member.status === "ACTIVE"
      && member.tag_ids.some((tag_id) => actorTags.has(tag_id))
    ) {
      userIds.add(member.user_id);
    }
  }
  return userIds;
}
