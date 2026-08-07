import { describe, expect, it } from "vitest";
import { normalizeDecimalAmount } from "./money.js";

describe("normalizeDecimalAmount", () => {
  it("reads the Brazilian form a person types", () => {
    expect(normalizeDecimalAmount("R$ 1.234,56")).toBe("1234.56");
    expect(normalizeDecimalAmount("1.234,56")).toBe("1234.56");
    expect(normalizeDecimalAmount("1234,56")).toBe("1234.56");
  });

  it("reads the machine form a mapping tool sends", () => {
    expect(normalizeDecimalAmount("1234.56")).toBe("1234.56");
    expect(normalizeDecimalAmount("1,234.56")).toBe("1234.56");
  });

  it("reads a whole number", () => {
    expect(normalizeDecimalAmount("1500")).toBe("1500");
    expect(normalizeDecimalAmount("R$ 1500")).toBe("1500");
  });

  it("reads a lone dot before exactly three digits as a thousands separator", () => {
    // "1.500" is fifteen hundred to whoever typed it into a Brazilian form,
    // and one and a half to parseFloat.
    expect(normalizeDecimalAmount("1.500")).toBe("1500");
    expect(normalizeDecimalAmount("12.500")).toBe("12500");
    expect(normalizeDecimalAmount("1.234.500")).toBe("1234500");
  });

  it("reads a lone dot before one or two digits as a decimal point", () => {
    expect(normalizeDecimalAmount("1500.5")).toBe("1500.5");
    expect(normalizeDecimalAmount("1500.50")).toBe("1500.50");
  });

  it("drops leading zeroes without losing the value", () => {
    expect(normalizeDecimalAmount("0001500,00")).toBe("1500.00");
    expect(normalizeDecimalAmount("0,50")).toBe("0.50");
    expect(normalizeDecimalAmount("0")).toBe("0");
  });

  it("keeps a negative amount negative", () => {
    expect(normalizeDecimalAmount("-1.234,56")).toBe("-1234.56");
  });

  it("refuses a value with no digits at all", () => {
    expect(normalizeDecimalAmount("não sei")).toBeNull();
    expect(normalizeDecimalAmount("R$")).toBeNull();
    expect(normalizeDecimalAmount("")).toBeNull();
    expect(normalizeDecimalAmount("   ")).toBeNull();
    expect(normalizeDecimalAmount(null)).toBeNull();
    expect(normalizeDecimalAmount(undefined)).toBeNull();
  });

  it("is idempotent on an amount it already normalized", () => {
    const once = normalizeDecimalAmount("R$ 1.234,56");
    expect(once).toBe("1234.56");
    expect(normalizeDecimalAmount(once)).toBe(once);
  });
});
