import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getLeadBoard = vi.fn();
const listTeam = vi.fn();
// `redirect()` aborts rendering by throwing; a mock that returns would let the
// page carry on reading a board the caller was never meant to reach.
const redirect = vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT ${destination}`);
});
const resolveWorkspaceAccess = vi.fn();

vi.mock("@marctco/db", () => ({ getLeadBoard, listTeam }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const MyLeadsPage = (await import("./page")).default;
const slug = randomUUID();

function render(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER") {
  resolveWorkspaceAccess.mockResolvedValue({
    status: "resolved",
    workspace: {
      role,
      context: { actor_type: "USER", workspace_id: randomUUID(), user_id: randomUUID(), role }
    }
  });
  return MyLeadsPage({ params: Promise.resolve({ slug }), searchParams: Promise.resolve({}) });
}

describe("Meus leads route", () => {
  beforeEach(() => {
    getLeadBoard.mockReset().mockResolvedValue({ pipeline_id: randomUUID(), columns: [] });
    listTeam.mockReset().mockResolvedValue([]);
    redirect.mockClear();
    resolveWorkspaceAccess.mockReset();
  });

  it.each(["MANAGER", "OWNER"] as const)(
    "sends %s to Leads instead of refusing — the board is an absence of scope, not a block",
    async (role) => {
      await expect(render(role)).rejects.toThrow("NEXT_REDIRECT");
      expect(redirect).toHaveBeenCalledWith(`/workspace/${slug}/leads`);
      expect(getLeadBoard).not.toHaveBeenCalled();
    }
  );

  it.each(["ATTENDANT", "SUPERVISOR"] as const)("reads the board for %s", async (role) => {
    await render(role);
    expect(redirect).not.toHaveBeenCalled();
    expect(getLeadBoard).toHaveBeenCalledOnce();
  });

  it("never asks an ATTENDANT's screen for the team roster", async () => {
    await render("ATTENDANT");
    expect(listTeam).not.toHaveBeenCalled();
  });
});
