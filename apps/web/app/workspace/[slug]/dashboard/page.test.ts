import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getOperationalDashboard = vi.fn();
const listUnresolvedNotifications = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT ${destination}`);
});
const resolveWorkspaceAccess = vi.fn();

vi.mock("@marctco/db", () => ({ getOperationalDashboard, listUnresolvedNotifications }));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const DashboardPage = (await import("./page")).default;
const slug = randomUUID();

function render(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER") {
  resolveWorkspaceAccess.mockResolvedValue({
    status: "resolved",
    workspace: {
      role,
      context: { kind: "user", workspace_id: randomUUID(), user_id: randomUUID(), role }
    }
  });
  return DashboardPage({ params: Promise.resolve({ slug }) });
}

describe("Dashboard route", () => {
  beforeEach(() => {
    getOperationalDashboard.mockReset().mockResolvedValue({
      tiles: [],
      series: { arrivals: [], sla_adherence: [], open_by_stage: [] },
      empty_state: null
    });
    listUnresolvedNotifications.mockReset().mockResolvedValue({ items: [] });
    notFound.mockClear();
    redirect.mockClear();
    resolveWorkspaceAccess.mockReset();
  });

  it("refuses ATTENDANT on the route itself, not only by hiding the nav item", async () => {
    await expect(render("ATTENDANT")).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
    expect(getOperationalDashboard).not.toHaveBeenCalled();
    expect(listUnresolvedNotifications).not.toHaveBeenCalled();
  });

  it.each(["SUPERVISOR", "MANAGER", "OWNER"] as const)(
    "reads dashboard numbers and unresolved notices together for %s",
    async (role) => {
      await render(role);
      expect(notFound).not.toHaveBeenCalled();
      expect(getOperationalDashboard).toHaveBeenCalledOnce();
      expect(listUnresolvedNotifications).toHaveBeenCalledOnce();
    }
  );
});
