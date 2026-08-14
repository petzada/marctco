import { randomUUID } from "node:crypto";
import type { UserWorkspace } from "@marctco/db";
import { describe, expect, it } from "vitest";
import { onboardingDecision } from "./onboarding-decision";

function workspace(): UserWorkspace {
  return {
    workspace_id: randomUUID(),
    slug: randomUUID(),
    name: "Assessoria Horizonte",
    role: "OWNER"
  };
}

describe("onboardingDecision", () => {
  it("provisions for a marked user who belongs nowhere yet", () => {
    expect(onboardingDecision({ workspace_name: "Assessoria Horizonte" }, [])).toEqual({
      kind: "provision",
      workspace_name: "Assessoria Horizonte"
    });
  });

  it("provisions for a marked owner who already belongs to a workspace", () => {
    expect(onboardingDecision({ workspace_name: "ACR" }, [workspace()])).toEqual({
      kind: "provision",
      workspace_name: "ACR"
    });
  });

  it("lets an unmarked collaborator enter as a member, never provisioning", () => {
    expect(onboardingDecision(null, [workspace()])).toEqual({ kind: "member" });
    expect(onboardingDecision(null, [workspace(), workspace()])).toEqual({ kind: "member" });
  });

  it("treats no right and no association as a terminal error, never a wait and never a login redirect", () => {
    const decision = onboardingDecision(null, []);
    expect(decision).toEqual({ kind: "denied" });
    expect(decision.kind).not.toBe("wait");
    expect(decision.kind).not.toBe("login");
  });
});
