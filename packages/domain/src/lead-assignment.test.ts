import { describe, expect, it } from "vitest";
import {
  decideLeadAssignment,
  decideLeadReassignment,
  type AssignmentMember
} from "./lead-assignment.js";

const manager: AssignmentMember = { user_id: "manager", role: "MANAGER", status: "ACTIVE", tag_ids: [] };
const owner: AssignmentMember = { user_id: "owner", role: "OWNER", status: "ACTIVE", tag_ids: [] };
const supervisor: AssignmentMember = { user_id: "supervisor", role: "SUPERVISOR", status: "ACTIVE", tag_ids: ["azul"] };
const teammate: AssignmentMember = { user_id: "attendant", role: "ATTENDANT", status: "ACTIVE", tag_ids: ["azul"] };
const outsider: AssignmentMember = { user_id: "outsider", role: "ATTENDANT", status: "ACTIVE", tag_ids: ["verde"] };

describe("decideLeadAssignment", () => {
  it.each(["ATTENDANT", "SUPERVISOR"] as const)("refuses %s as an actor", (role) => {
    expect(decideLeadAssignment({ actor: { ...manager, role }, destination: supervisor })).toEqual({
      allowed: false,
      reason: "ACTOR_CANNOT_ASSIGN"
    });
  });

  it("accepts an active tagged Supervisor and the actor themselves", () => {
    expect(decideLeadAssignment({ actor: manager, destination: supervisor })).toEqual({ allowed: true });
    expect(decideLeadAssignment({ actor: owner, destination: owner })).toEqual({ allowed: true });
  });

  it.each([
    [{ ...teammate }, "DESTINATION_MUST_BE_SUPERVISOR_OR_SELF"],
    [{ ...supervisor, tag_ids: [] }, "SUPERVISOR_REQUIRES_TAG"],
    [{ ...supervisor, status: "DETACHED" as const }, "DESTINATION_INACTIVE"],
    [{ ...manager, user_id: "other-manager" }, "DESTINATION_MUST_BE_SUPERVISOR_OR_SELF"],
    [{ ...owner, user_id: "other-owner" }, "DESTINATION_MUST_BE_SUPERVISOR_OR_SELF"]
  ] as const)("refuses an invalid queue destination", (destination, reason) => {
    expect(decideLeadAssignment({ actor: manager, destination })).toEqual({ allowed: false, reason });
  });
});

describe("decideLeadReassignment", () => {
  it("lets Management and Direction move any assigned lead to an active member", () => {
    expect(decideLeadReassignment({ actor: manager, currentOwner: outsider, destination: teammate })).toEqual({ allowed: true });
    expect(decideLeadReassignment({ actor: owner, currentOwner: outsider, destination: teammate })).toEqual({ allowed: true });
  });

  it("lets a Supervisor move only from and to their tagged team", () => {
    expect(decideLeadReassignment({ actor: supervisor, currentOwner: supervisor, destination: teammate })).toEqual({ allowed: true });
    expect(decideLeadReassignment({ actor: supervisor, currentOwner: outsider, destination: teammate })).toEqual({ allowed: false, reason: "CURRENT_OWNER_OUTSIDE_TEAM" });
    expect(decideLeadReassignment({ actor: supervisor, currentOwner: teammate, destination: outsider })).toEqual({ allowed: false, reason: "DESTINATION_OUTSIDE_TEAM" });
    expect(decideLeadReassignment({ actor: { ...supervisor, tag_ids: [] }, currentOwner: supervisor, destination: teammate })).toEqual({ allowed: false, reason: "SUPERVISOR_REQUIRES_TAG" });
  });

  it("refuses Attendants and detached destinations", () => {
    expect(decideLeadReassignment({ actor: teammate, currentOwner: teammate, destination: supervisor })).toEqual({ allowed: false, reason: "ACTOR_CANNOT_REASSIGN" });
    expect(decideLeadReassignment({ actor: manager, currentOwner: teammate, destination: { ...teammate, status: "DETACHED" } })).toEqual({ allowed: false, reason: "DESTINATION_INACTIVE" });
  });
});
