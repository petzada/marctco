import { describe, expect, it } from "vitest";
import { normalizeCpf } from "./cpf.js";

describe("normalizeCpf", () => {
  it("keeps only the digits of a formatted CPF", () => {
    expect(normalizeCpf("529.982.247-25")).toBe("52998224725");
  });

  it("accepts a CPF that already arrived as digits", () => {
    expect(normalizeCpf("52998224725")).toBe("52998224725");
  });

  it("tolerates surrounding whitespace and stray separators", () => {
    expect(normalizeCpf("  529 982 247 25 ")).toBe("52998224725");
  });

  it("rejects a CPF whose check digits do not match", () => {
    expect(normalizeCpf("529.982.247-26")).toBeNull();
  });

  it("rejects a repeated-digit placeholder even though the arithmetic passes", () => {
    expect(normalizeCpf("111.111.111-11")).toBeNull();
    expect(normalizeCpf("00000000000")).toBeNull();
  });

  it("rejects a value that is too short or too long", () => {
    expect(normalizeCpf("5299822472")).toBeNull();
    expect(normalizeCpf("529982247250")).toBeNull();
  });

  it("rejects an absent or non-string value", () => {
    expect(normalizeCpf(null)).toBeNull();
    expect(normalizeCpf(undefined)).toBeNull();
    expect(normalizeCpf("")).toBeNull();
  });

  it("computes a check digit of zero correctly", () => {
    // Both check digits fall in the remainder < 2 branch, which is the arm a
    // naive implementation gets wrong.
    expect(normalizeCpf("111.444.777-35")).toBe("11144477735");
  });
});
