import { describe, expect, it } from "vitest";
import { attendsLeads, seesLeadsTable } from "./lead-board-access";

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

describe("seesLeadsTable", () => {
  it("keeps the table for who distributes or follows the team", () => {
    expect(seesLeadsTable("SUPERVISOR")).toBe(true);
    expect(seesLeadsTable("MANAGER")).toBe(true);
    expect(seesLeadsTable("OWNER")).toBe(true);
  });

  it("hides the table from the ATTENDANT — Meus leads already shows their set", () => {
    expect(seesLeadsTable("ATTENDANT")).toBe(false);
  });
});
