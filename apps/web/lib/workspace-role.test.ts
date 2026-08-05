import { describe, expect, it } from "vitest";
import { workspaceRoleLabel } from "./workspace-role.js";

describe("workspaceRoleLabel", () => {
  it("keeps access-profile labels in PT-BR", () => {
    expect(workspaceRoleLabel("ATTENDANT")).toBe("Atendente");
    expect(workspaceRoleLabel("SUPERVISOR")).toBe("Supervisor");
    expect(workspaceRoleLabel("MANAGER")).toBe("Gestão");
    expect(workspaceRoleLabel("OWNER")).toBe("Direção");
  });
});
