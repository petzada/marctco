import { describe, expect, it } from "vitest";
import { teamUserIds, type TeamScopeMember } from "./team-scope.js";

const members: readonly TeamScopeMember[] = [
  { user_id: "supervisor", status: "ACTIVE", tag_ids: ["acr", "manha"] },
  { user_id: "acr", status: "ACTIVE", tag_ids: ["acr"] },
  { user_id: "manha", status: "ACTIVE", tag_ids: ["manha"] },
  { user_id: "real", status: "ACTIVE", tag_ids: ["real"] },
  { user_id: "untagged", status: "ACTIVE", tag_ids: [] },
  { user_id: "detached", status: "DETACHED", tag_ids: ["acr"] }
];

describe("teamUserIds", () => {
  it("returns every ACTIVE member sharing at least one tag, including the Supervisor", () => {
    expect([...teamUserIds(["acr", "manha"], members)]).toEqual([
      "supervisor",
      "acr",
      "manha"
    ]);
  });

  it("excludes DETACHED members, other teams and untagged attendants", () => {
    expect([...teamUserIds(["acr"], members)]).toEqual(["supervisor", "acr"]);
  });

  it("fails closed with an empty set when the Supervisor has no tag", () => {
    expect(teamUserIds([], members)).toEqual(new Set());
  });
});
