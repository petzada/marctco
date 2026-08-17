import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const listAgenda = vi.fn();
const listLeads = vi.fn();
const listTeam = vi.fn();
const resolveWorkspaceAccess = vi.fn();

vi.mock("@marctco/db", () => ({ listAgenda, listLeads, listTeam }));
vi.mock("../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const AgendaPage = (await import("./page")).default;
const slug = randomUUID();
const tag = randomUUID();
const from = new Date("2026-08-17T03:00:00.000Z");
const to = new Date("2026-08-24T03:00:00.000Z");

function render(
  role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER",
  searchParams: Record<string, string | string[] | undefined> = {}
) {
  resolveWorkspaceAccess.mockResolvedValue({
    status: "resolved",
    workspace: {
      role,
      context: { kind: "user", workspace_id: randomUUID(), user_id: randomUUID(), role }
    }
  });
  return AgendaPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve(searchParams)
  });
}

describe("Agenda route", () => {
  beforeEach(() => {
    listAgenda.mockReset().mockResolvedValue({ items: [], tags: [], pipelines: [] });
    listLeads.mockReset().mockResolvedValue([]);
    listTeam.mockReset().mockResolvedValue([]);
    resolveWorkspaceAccess.mockReset();
  });

  it.each(["ATTENDANT", "SUPERVISOR", "MANAGER", "OWNER"] as const)(
    "reads the named agenda operation for %s",
    async (role) => {
      await render(role, { view: "day", date: "2026-08-17" });
      expect(listAgenda).toHaveBeenCalledOnce();
      expect(listLeads).toHaveBeenCalledOnce();
    }
  );

  it("passes the URL interval and filters to listAgenda instead of assembling a where", async () => {
    await render("MANAGER", { view: "week", date: "2026-08-19", tag });
    expect(listAgenda).toHaveBeenCalledWith(
      expect.objectContaining({ role: "MANAGER" }),
      expect.objectContaining({
        from,
        to,
        tag_id: tag
      })
    );
  });

  it("never asks an ATTENDANT's screen for the team roster", async () => {
    await render("ATTENDANT", { date: "2026-08-17" });
    expect(listTeam).not.toHaveBeenCalled();
  });
});
