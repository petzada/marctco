import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listLeads = vi.fn();
const countLeadsByMarker = vi.fn();
const listTeam = vi.fn();
const listLeadAssignmentDestinations = vi.fn();
const redirect = vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT ${destination}`);
});
const resolveWorkspaceAccess = vi.fn();

vi.mock("@marctco/db", () => ({
  listLeads,
  countLeadsByMarker,
  listTeam,
  listLeadAssignmentDestinations
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const LeadsPage = (await import("./page")).default;
const slug = randomUUID();

function render(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER") {
  resolveWorkspaceAccess.mockResolvedValue({
    status: "resolved",
    workspace: {
      role,
      context: { actor_type: "USER", workspace_id: randomUUID(), user_id: randomUUID(), role }
    }
  });
  return LeadsPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });
}

describe("Leads table route", () => {
  beforeEach(() => {
    listLeads.mockReset().mockResolvedValue([]);
    countLeadsByMarker.mockReset().mockResolvedValue({});
    listTeam.mockReset().mockResolvedValue([]);
    listLeadAssignmentDestinations.mockReset().mockResolvedValue([]);
    redirect.mockClear();
    resolveWorkspaceAccess.mockReset();
  });

  it("sends ATTENDANT to Meus leads instead of refusing — the table is an absence of scope, not a block", async () => {
    await expect(render("ATTENDANT")).rejects.toThrow("NEXT_REDIRECT");
    expect(redirect).toHaveBeenCalledWith(`/workspace/${slug}/my-leads`);
    expect(listLeads).not.toHaveBeenCalled();
  });

  it.each(["SUPERVISOR", "MANAGER", "OWNER"] as const)("reads the table for %s", async (role) => {
    await render(role);
    expect(redirect).not.toHaveBeenCalled();
    expect(listLeads).toHaveBeenCalledOnce();
  });
});
