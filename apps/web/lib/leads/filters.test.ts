import { describe, expect, it } from "vitest";
import { parseMarkerFilter } from "./filters.js";

describe("parseMarkerFilter", () => {
  it("accepts each known marker", () => {
    expect(parseMarkerFilter("MISSING_PHONE")).toBe("MISSING_PHONE");
    expect(parseMarkerFilter("IDENTITY_CONFLICT")).toBe("IDENTITY_CONFLICT");
    expect(parseMarkerFilter("POSSIBLE_DUPLICATE")).toBe("POSSIBLE_DUPLICATE");
  });

  it("degrades an unknown or absent value to no filter, never a crash", () => {
    expect(parseMarkerFilter(undefined)).toBeUndefined();
    expect(parseMarkerFilter(null)).toBeUndefined();
    expect(parseMarkerFilter("")).toBeUndefined();
    expect(parseMarkerFilter("SOME_FUTURE_MARKER")).toBeUndefined();
    expect(parseMarkerFilter("FIRST_CONTACT_SLA_BREACHED")).toBeUndefined();
  });
});
