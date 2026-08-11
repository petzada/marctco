import { describe, expect, it } from "vitest";
import { canReleaseQuarantinedLead } from "./quarantine-release-eligibility";

describe("canReleaseQuarantinedLead", () => {
  it("refuses when both phone and e-mail are empty", () => {
    expect(canReleaseQuarantinedLead({ phone: "", email: "" })).toBe(false);
  });

  it("refuses whitespace-only input the same as empty", () => {
    expect(canReleaseQuarantinedLead({ phone: "   ", email: "  " })).toBe(false);
  });

  it("allows a phone alone", () => {
    expect(canReleaseQuarantinedLead({ phone: "11987654321", email: "" })).toBe(true);
  });

  it("allows an e-mail alone", () => {
    expect(canReleaseQuarantinedLead({ phone: "", email: "maria@exemplo.com" })).toBe(true);
  });

  it("allows both", () => {
    expect(
      canReleaseQuarantinedLead({ phone: "11987654321", email: "maria@exemplo.com" })
    ).toBe(true);
  });
});
