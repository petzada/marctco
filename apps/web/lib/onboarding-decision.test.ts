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

  it("leaves an unmarked user without an association waiting, never provisioning", () => {
    // O colaborador cuja associação foi removida cai exatamente aqui: sem o
    // direito em app_metadata, o login não cria workspace nenhum.
    expect(onboardingDecision(null, [])).toEqual({ kind: "wait" });
  });

  it("never provisions for someone who already belongs to a workspace", () => {
    expect(onboardingDecision({ workspace_name: "Segunda casa" }, [workspace()])).toEqual({
      kind: "member"
    });
    expect(onboardingDecision(null, [workspace(), workspace()])).toEqual({ kind: "member" });
  });
});
