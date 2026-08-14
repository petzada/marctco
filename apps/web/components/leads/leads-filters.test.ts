import { describe, expect, it } from "vitest";
import { leadFilterTeams } from "./leads-filters.js";

describe("LeadsFilters", () => {
  it("deduplicates and orders team filter options", () => {
    expect(leadFilterTeams([{ tags: ["REAL", "ACR"] }, { tags: ["ACR"] }])).toEqual(["ACR", "REAL"]);
  });
});
