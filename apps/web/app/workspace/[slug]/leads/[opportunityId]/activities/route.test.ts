import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const createActivity = vi.fn();
const resolveWorkspaceAccess = vi.fn();
vi.mock("@marctco/db", () => ({ createActivity }));
vi.mock("../../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const { POST } = await import("./route");
const slug = randomUUID();
const opportunityId = randomUUID();
const context = { kind: "user", workspace_id: randomUUID(), user_id: randomUUID(), role: "ATTENDANT" };

function request(body: unknown) {
  return new Request(`https://app.marctco.test/workspace/${slug}/leads/${opportunityId}/activities`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST lead activity", () => {
  beforeEach(() => {
    createActivity.mockReset().mockResolvedValue({ id: randomUUID(), status: "OPEN" });
    resolveWorkspaceAccess.mockReset().mockResolvedValue({
      status: "resolved",
      workspace: { context }
    });
  });

  it("sends the create through the named operation", async () => {
    const due_at = "2026-08-18T18:00:00.000Z";
    const response = await POST(request({ type: "CALL", title: "Ligar", due_at }), {
      params: Promise.resolve({ slug, opportunityId })
    });
    expect(createActivity).toHaveBeenCalledWith(context, {
      opportunity_id: opportunityId,
      type: "CALL",
      title: "Ligar",
      due_at: new Date(due_at)
    });
    expect(response.status).toBe(200);
  });

  it("translates a named-operation refusal to PT-BR", async () => {
    createActivity.mockRejectedValue(new Error("OPPORTUNITY_CLOSED"));
    const response = await POST(
      request({ type: "TASK", title: "Não", due_at: "2026-08-18T18:00:00.000Z" }),
      { params: Promise.resolve({ slug, opportunityId }) }
    );
    await expect(response.json()).resolves.toEqual({
      error: "Não dá para marcar atividade em lead ganho ou perdido."
    });
  });

  it("returns 404 when workspace access is absent", async () => {
    resolveWorkspaceAccess.mockResolvedValue({ status: "not-found" });
    const response = await POST(request({ type: "TASK", title: "X", due_at: "2026-08-18T18:00:00.000Z" }), {
      params: Promise.resolve({ slug, opportunityId })
    });
    expect(response.status).toBe(404);
    expect(createActivity).not.toHaveBeenCalled();
  });
});
