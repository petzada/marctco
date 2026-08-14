import { describe, expect, it } from "vitest";
import { membershipActionCopy } from "./member-lifecycle-actions";

describe("Equipe membership confirmations", () => {
  it("states the exact tenant boundary for detach and the actor-owned boundary for termination", () => {
    expect(membershipActionCopy("detach", "Ana").description).toContain("deste workspace");
    const termination = membershipActionCopy("terminate", "Ana").description;
    expect(termination).toContain("em que você é Direção");
    expect(termination).toContain("Vínculos de outros responsáveis não são alterados");
    expect(termination).not.toContain("workspace nenhum");
  });
});
