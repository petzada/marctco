import { describe, expect, it } from "vitest";
import { normalizePhone, readPhone } from "./phone.js";

describe("normalizePhone", () => {
  it("assumes Brazil for a bare mobile number with an area code", () => {
    expect(normalizePhone("11987654321")).toBe("+5511987654321");
  });

  it("ignores the punctuation a form field collects", () => {
    expect(normalizePhone("(11) 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("  11 9 8765 4321 ")).toBe("+5511987654321");
  });

  it("accepts a number that already carries the country code, with or without the plus", () => {
    expect(normalizePhone("+55 11 98765-4321")).toBe("+5511987654321");
    expect(normalizePhone("5511987654321")).toBe("+5511987654321");
  });

  it("accepts an eight-digit landline behind its area code", () => {
    expect(normalizePhone("11 3333-4444")).toBe("+551133334444");
  });

  it("refuses a Brazilian number typed without its area code", () => {
    // It parses as a valid landline in another state, which is worse than
    // refusing: the CRM would store a number that reaches a stranger.
    expect(normalizePhone("987654321")).toBeNull();
    expect(normalizePhone("98765-4321")).toBeNull();
  });

  it("refuses a number nobody can be reached on personally", () => {
    expect(normalizePhone("0800 123 4567")).toBeNull();
  });

  it("tells a number it could not read apart from one nobody answers personally", () => {
    // Both end up refused, and a manager sent to look for a typo in a valid
    // 0800 is a manager looking at the wrong thing.
    expect(readPhone("0800 123 4567")).toEqual({ kind: "NOT_A_PERSONAL_PHONE" });
    expect(readPhone("não informado")).toEqual({ kind: "NOT_A_PHONE" });
    expect(readPhone("11987654321")).toEqual({ kind: "E164", value: "+5511987654321" });
  });

  it("keeps a genuinely international number in its own country code", () => {
    expect(normalizePhone("+1 415 555 0132")).toBe("+14155550132");
  });

  it("refuses text, empty input and an absent value", () => {
    expect(normalizePhone("não informado")).toBeNull();
    expect(normalizePhone("")).toBeNull();
    expect(normalizePhone("   ")).toBeNull();
    expect(normalizePhone(null)).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });

  it("refuses a number with too many digits to be Brazilian", () => {
    expect(normalizePhone("011 11 98765-4321")).toBeNull();
  });

  it("is idempotent on a number it already normalized", () => {
    const once = normalizePhone("(11) 98765-4321");
    expect(once).not.toBeNull();
    expect(normalizePhone(once)).toBe(once);
  });
});
