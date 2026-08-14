import { describe, expect, it } from "vitest";
import { supervisorTeamEmptyState } from "./supervisor-team-empty-state";

describe("supervisorTeamEmptyState", () => {
  it.each(["leads", "team"] as const)("names the missing tag and who resolves it on %s", (surface) => {
    const copy = supervisorTeamEmptyState(surface);
    expect(copy.description).toContain("tag de equipe");
    expect(copy.description).toContain("Dire\u00e7\u00e3o");
    expect(copy.description).toContain("Equipe");
  });
});
