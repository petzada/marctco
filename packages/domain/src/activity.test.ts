import { describe, expect, it } from "vitest";
import {
  activityAssigneeUserIds,
  decideActivityCreate,
  decideActivityTransition,
  isActivityOverdue,
  isActivityType,
  memberReachesOpportunity,
  type ActivityAssigneeMember
} from "./activity.js";

const attendant: ActivityAssigneeMember = {
  user_id: "ana",
  role: "ATTENDANT",
  status: "ACTIVE",
  tag_ids: ["acr"]
};
const colleague: ActivityAssigneeMember = {
  user_id: "bia",
  role: "ATTENDANT",
  status: "ACTIVE",
  tag_ids: ["acr"]
};
const outsider: ActivityAssigneeMember = {
  user_id: "carla",
  role: "ATTENDANT",
  status: "ACTIVE",
  tag_ids: ["real"]
};
const supervisor: ActivityAssigneeMember = {
  user_id: "sofia",
  role: "SUPERVISOR",
  status: "ACTIVE",
  tag_ids: ["acr"]
};
const untaggedSupervisor: ActivityAssigneeMember = {
  user_id: "sem-tag",
  role: "SUPERVISOR",
  status: "ACTIVE",
  tag_ids: []
};
const manager: ActivityAssigneeMember = {
  user_id: "marina",
  role: "MANAGER",
  status: "ACTIVE",
  tag_ids: []
};
const owner: ActivityAssigneeMember = {
  user_id: "direcao",
  role: "OWNER",
  status: "ACTIVE",
  tag_ids: []
};
const detached: ActivityAssigneeMember = {
  user_id: "ex",
  role: "ATTENDANT",
  status: "DETACHED",
  tag_ids: ["acr"]
};

const members: readonly ActivityAssigneeMember[] = [
  attendant,
  colleague,
  outsider,
  supervisor,
  untaggedSupervisor,
  manager,
  owner,
  detached
];

describe("activityAssigneeUserIds", () => {
  it("lets an Attendant designate only themselves", () => {
    expect([...activityAssigneeUserIds(attendant, members)]).toEqual(["ana"]);
  });

  it("lets a tagged Supervisor designate the team, not another team", () => {
    expect([...activityAssigneeUserIds(supervisor, members)].sort()).toEqual(["ana", "bia", "sofia"]);
  });

  it("lets an untagged Supervisor designate only themselves, not an empty team", () => {
    expect([...activityAssigneeUserIds(untaggedSupervisor, members)]).toEqual(["sem-tag"]);
  });

  it("lets Gestão and Direção designate every ACTIVE member", () => {
    expect([...activityAssigneeUserIds(manager, members)].sort()).toEqual([
      "ana",
      "bia",
      "carla",
      "direcao",
      "marina",
      "sem-tag",
      "sofia"
    ]);
    expect(activityAssigneeUserIds(owner, members)).toEqual(activityAssigneeUserIds(manager, members));
  });

  it("never includes a DETACHED member", () => {
    expect(activityAssigneeUserIds(manager, members).has("ex")).toBe(false);
    expect(activityAssigneeUserIds(supervisor, members).has("ex")).toBe(false);
  });
});

describe("memberReachesOpportunity", () => {
  it("lets an Attendant reach only a lead assigned to them", () => {
    expect(
      memberReachesOpportunity({
        member: attendant,
        members,
        opportunity: { assigned_user_id: "ana" }
      })
    ).toBe(true);
    expect(
      memberReachesOpportunity({
        member: attendant,
        members,
        opportunity: { assigned_user_id: "bia" }
      })
    ).toBe(false);
  });

  it("lets a tagged Supervisor reach the team's leads and not another team's", () => {
    expect(
      memberReachesOpportunity({
        member: supervisor,
        members,
        opportunity: { assigned_user_id: "ana" }
      })
    ).toBe(true);
    expect(
      memberReachesOpportunity({
        member: supervisor,
        members,
        opportunity: { assigned_user_id: "carla" }
      })
    ).toBe(false);
  });

  it("gives an untagged Supervisor no lead, including one assigned to themselves", () => {
    expect(
      memberReachesOpportunity({
        member: untaggedSupervisor,
        members,
        opportunity: { assigned_user_id: "sem-tag" }
      })
    ).toBe(false);
  });

  it("lets Gestão reach an unassigned lead that an Attendant cannot", () => {
    expect(
      memberReachesOpportunity({
        member: manager,
        members,
        opportunity: { assigned_user_id: null }
      })
    ).toBe(true);
    expect(
      memberReachesOpportunity({
        member: attendant,
        members,
        opportunity: { assigned_user_id: null }
      })
    ).toBe(false);
  });
});

describe("decideActivityCreate", () => {
  const openOwnLead = {
    status: "OPEN" as const,
    merged_into_opportunity_id: null,
    assigned_user_id: "ana"
  };

  it("refuses a won, lost or merged lead", () => {
    expect(
      decideActivityCreate({
        opportunity: { ...openOwnLead, status: "WON" },
        actor: attendant,
        assignee: attendant,
        members
      })
    ).toEqual({ allowed: false, reason: "OPPORTUNITY_CLOSED" });
    expect(
      decideActivityCreate({
        opportunity: { ...openOwnLead, status: "LOST" },
        actor: attendant,
        assignee: attendant,
        members
      })
    ).toEqual({ allowed: false, reason: "OPPORTUNITY_CLOSED" });
    expect(
      decideActivityCreate({
        opportunity: { ...openOwnLead, merged_into_opportunity_id: "canonical" },
        actor: attendant,
        assignee: attendant,
        members
      })
    ).toEqual({ allowed: false, reason: "OPPORTUNITY_MERGED" });
  });

  it("refuses an Attendant designating a colleague", () => {
    expect(
      decideActivityCreate({
        opportunity: openOwnLead,
        actor: attendant,
        assignee: colleague,
        members
      })
    ).toEqual({ allowed: false, reason: "ASSIGNEE_NOT_ALLOWED" });
  });

  it("refuses a Supervisor designating someone outside the team", () => {
    expect(
      decideActivityCreate({
        opportunity: { ...openOwnLead, assigned_user_id: "ana" },
        actor: supervisor,
        assignee: outsider,
        members
      })
    ).toEqual({ allowed: false, reason: "ASSIGNEE_NOT_ALLOWED" });
  });

  it("refuses a responsible who cannot open that lead", () => {
    expect(
      decideActivityCreate({
        opportunity: { ...openOwnLead, assigned_user_id: "ana" },
        actor: manager,
        assignee: outsider,
        members
      })
    ).toEqual({ allowed: false, reason: "ASSIGNEE_CANNOT_REACH_LEAD" });
  });

  it("refuses a DETACHED responsible", () => {
    expect(
      decideActivityCreate({
        opportunity: openOwnLead,
        actor: manager,
        assignee: detached,
        members
      })
    ).toEqual({ allowed: false, reason: "ASSIGNEE_INACTIVE" });
  });

  it("lets Gestão mark work for an Attendant on that Attendant's lead", () => {
    expect(
      decideActivityCreate({
        opportunity: openOwnLead,
        actor: manager,
        assignee: attendant,
        members
      })
    ).toEqual({ allowed: true });
  });
});

describe("decideActivityTransition", () => {
  it("lets an open activity be completed, canceled or rescheduled", () => {
    expect(decideActivityTransition("OPEN", "COMPLETE")).toEqual({ allowed: true });
    expect(decideActivityTransition("OPEN", "CANCEL")).toEqual({ allowed: true });
    expect(decideActivityTransition("OPEN", "RESCHEDULE")).toEqual({ allowed: true });
  });

  it("refuses completing, canceling or rescheduling a completed activity", () => {
    expect(decideActivityTransition("DONE", "COMPLETE")).toEqual({
      allowed: false,
      reason: "ALREADY_DONE"
    });
    expect(decideActivityTransition("DONE", "CANCEL")).toEqual({
      allowed: false,
      reason: "ALREADY_DONE"
    });
    expect(decideActivityTransition("DONE", "RESCHEDULE")).toEqual({
      allowed: false,
      reason: "ALREADY_DONE"
    });
  });

  it("treats cancel as a distinct refusal from complete", () => {
    expect(decideActivityTransition("CANCELED", "COMPLETE")).toEqual({
      allowed: false,
      reason: "ALREADY_CANCELED"
    });
    expect(decideActivityTransition("CANCELED", "CANCEL")).toEqual({
      allowed: false,
      reason: "ALREADY_CANCELED"
    });
  });
});

describe("isActivityOverdue", () => {
  const now = new Date("2026-08-17T15:00:00.000Z");

  it("highlights an open activity past due_at and ignores a completed one", () => {
    expect(
      isActivityOverdue({
        status: "OPEN",
        due_at: new Date("2026-08-17T14:59:59.000Z"),
        now
      })
    ).toBe(true);
    expect(
      isActivityOverdue({
        status: "DONE",
        due_at: new Date("2026-08-17T14:00:00.000Z"),
        now
      })
    ).toBe(false);
    expect(
      isActivityOverdue({
        status: "OPEN",
        due_at: now,
        now
      })
    ).toBe(false);
  });
});

describe("isActivityType", () => {
  it("accepts the four types and refuses a channel-named value", () => {
    expect(isActivityType("CALL")).toBe(true);
    expect(isActivityType("MESSAGE")).toBe(true);
    expect(isActivityType("WHATSAPP")).toBe(false);
  });
});
