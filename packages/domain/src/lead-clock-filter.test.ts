import { describe, expect, it } from "vitest";
import { LEAD_CLOCK_FILTERS, parseLeadClockFilter } from "./lead-clock-filter.js";

describe("parseLeadClockFilter", () => {
  it.each(LEAD_CLOCK_FILTERS)("accepts %s", (value) => {
    expect(parseLeadClockFilter(value)).toBe(value);
  });

  it("degrades unknown values to no filter", () => {
    expect(parseLeadClockFilter("FIRST_CONTACT_SLA_BREACHED")).toBeUndefined();
    expect(parseLeadClockFilter(null)).toBeUndefined();
  });
});
