import { describe, expect, it } from "vitest";
import { maskIntegrationSecret } from "./mask-integration-secret";

describe("maskIntegrationSecret", () => {
  it("shows only the last four characters, never the cleartext value", () => {
    const masked = maskIntegrationSecret("a1b2");
    expect(masked.endsWith("a1b2")).toBe(true);
    expect(masked).not.toContain("mtco_a1b2");
    expect(masked.startsWith("mtco_")).toBe(true);
  });
});
