import { describe, expect, it } from "vitest";
import { canReadDashboard } from "./dashboard-access";

describe("canReadDashboard", () => {
  it("allows Supervisor, Gestão and Direção, and refuses Atendente", () => {
    expect(canReadDashboard("SUPERVISOR")).toBe(true);
    expect(canReadDashboard("MANAGER")).toBe(true);
    expect(canReadDashboard("OWNER")).toBe(true);
    expect(canReadDashboard("ATTENDANT")).toBe(false);
  });
});
