import { describe, expect, it } from "vitest";
import { normalizeEmail } from "./email.js";

describe("normalizeEmail", () => {
  it("folds case so the same address matches itself", () => {
    expect(normalizeEmail("Joao.Silva@Gmail.COM")).toBe("joao.silva@gmail.com");
  });

  it("trims the whitespace a copied field carries", () => {
    expect(normalizeEmail("  joao@exemplo.com.br  ")).toBe("joao@exemplo.com.br");
  });

  it("refuses a value that is plainly not an address", () => {
    expect(normalizeEmail("não tenho")).toBeNull();
    expect(normalizeEmail("11987654321")).toBeNull();
    expect(normalizeEmail("joao@")).toBeNull();
    expect(normalizeEmail("@gmail.com")).toBeNull();
    expect(normalizeEmail("joao@gmail")).toBeNull();
    expect(normalizeEmail("joao silva@gmail.com")).toBeNull();
  });

  it("refuses an absent or empty value", () => {
    expect(normalizeEmail(null)).toBeNull();
    expect(normalizeEmail(undefined)).toBeNull();
    expect(normalizeEmail("")).toBeNull();
    expect(normalizeEmail("   ")).toBeNull();
  });

  it("is idempotent on an address it already normalized", () => {
    const once = normalizeEmail(" Joao@Exemplo.com ");
    expect(once).toBe("joao@exemplo.com");
    expect(normalizeEmail(once)).toBe(once);
  });
});
