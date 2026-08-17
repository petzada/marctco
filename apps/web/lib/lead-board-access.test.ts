import { describe, expect, it } from "vitest";
import { attendsLeads } from "./lead-board-access";

describe("attendsLeads", () => {
  it("gives the board to whoever attends", () => {
    expect(attendsLeads("ATTENDANT")).toBe(true);
    expect(attendsLeads("SUPERVISOR")).toBe(true);
  });

  it("keeps the board away from Gestão and Direção, who distribute instead", () => {
    expect(attendsLeads("MANAGER")).toBe(false);
    expect(attendsLeads("OWNER")).toBe(false);
  });
});
