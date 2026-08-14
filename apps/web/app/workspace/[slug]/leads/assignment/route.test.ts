import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const assignLeads = vi.fn();
const reassignLeads = vi.fn();
const resolveWorkspaceAccess = vi.fn();
vi.mock("@marctco/db", () => ({ assignLeads, reassignLeads }));
vi.mock("../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const { POST } = await import("./route");
const slug = randomUUID();
const context = { actor_type: "USER", workspace_id: randomUUID(), user_id: randomUUID(), role: "MANAGER" };

function request(body: unknown) {
  return new Request(`https://app.marctco.test/workspace/${slug}/leads/assignment`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body)
  });
}

describe("POST lead assignment", () => {
  beforeEach(() => {
    assignLeads.mockReset().mockResolvedValue({ assigned: [], refused: [] });
    reassignLeads.mockReset().mockResolvedValue({ assigned: [], refused: [] });
    resolveWorkspaceAccess.mockReset().mockResolvedValue({ status: "resolved", workspace: { context } });
  });

  it("sends the whole queue batch through one named operation", async () => {
    const opportunity_ids = [randomUUID(), randomUUID()];
    const user_id = randomUUID();
    const response = await POST(request({ mode: "ASSIGN", opportunity_ids, user_id }), { params: Promise.resolve({ slug }) });
    expect(assignLeads).toHaveBeenCalledOnce();
    expect(assignLeads).toHaveBeenCalledWith(context, { opportunity_ids, user_id });
    expect(response.status).toBe(200);
  });

  it("keeps reassignment distinct and carries each current owner", async () => {
    const assignments = [{ opportunity_id: randomUUID(), current_user_id: randomUUID() }];
    const user_id = randomUUID();
    await POST(request({ mode: "REASSIGN", assignments, user_id }), { params: Promise.resolve({ slug }) });
    expect(reassignLeads).toHaveBeenCalledWith(context, { assignments, user_id });
    expect(assignLeads).not.toHaveBeenCalled();
  });

  it("returns the same 404 when workspace access is absent", async () => {
    resolveWorkspaceAccess.mockResolvedValue({ status: "not-found" });
    const response = await POST(request({ mode: "ASSIGN", opportunity_ids: [], user_id: randomUUID() }), { params: Promise.resolve({ slug }) });
    expect(response.status).toBe(404);
    expect(assignLeads).not.toHaveBeenCalled();
  });

  it("translates domain refusal codes to PT-BR at the web boundary", async () => {
    assignLeads.mockRejectedValue(new Error("DESTINATION_MUST_BE_SUPERVISOR_OR_SELF"));
    const response = await POST(request({ mode: "ASSIGN", opportunity_ids: [randomUUID()], user_id: randomUUID() }), { params: Promise.resolve({ slug }) });
    await expect(response.json()).resolves.toEqual({
      error: "Da fila, escolha um Supervisor com equipe ou assuma o lead."
    });
  });
});
