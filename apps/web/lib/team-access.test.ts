import { describe, expect, it } from "vitest";
import { canManageTeam, canReadTeam, COLLABORATOR_ROLE_OPTIONS } from "./team-access";

describe("Equipe access", () => {
  it("keeps ATTENDANT outside the roster while allowing its three readers", () => {
    expect(canReadTeam("ATTENDANT")).toBe(false);
    expect(canReadTeam("SUPERVISOR")).toBe(true);
    expect(canReadTeam("MANAGER")).toBe(true);
    expect(canReadTeam("OWNER")).toBe(true);
  });

  it("reserves cadastro and editing for Direcao", () => {
    expect(canManageTeam("OWNER")).toBe(true);
    expect(canManageTeam("MANAGER")).toBe(false);
    expect(canManageTeam("SUPERVISOR")).toBe(false);
  });

  it("never offers OWNER as a collaborator role", () => {
    expect(COLLABORATOR_ROLE_OPTIONS.map(({ value }) => value)).toEqual([
      "ATTENDANT",
      "SUPERVISOR",
      "MANAGER"
    ]);
  });
});
