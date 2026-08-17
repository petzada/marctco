import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const moveLeadStage = vi.fn();
const resolveWorkspaceAccess = vi.fn();

class LeadStageMoveError extends Error {
  constructor(readonly reason: string) {
    super(reason);
    this.name = "LeadStageMoveError";
  }
}

vi.mock("@marctco/db", () => ({ moveLeadStage, LeadStageMoveError }));
vi.mock("../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const { POST } = await import("./route");
const slug = randomUUID();
const context = { actor_type: "USER", workspace_id: randomUUID(), user_id: randomUUID(), role: "ATTENDANT" };

function request(body: unknown) {
  return new Request(`https://app.marctco.test/workspace/${slug}/my-leads/stage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const drag = {
  opportunity_id: randomUUID(),
  current_stage_id: randomUUID(),
  stage_id: randomUUID()
};

describe("POST my-leads stage", () => {
  beforeEach(() => {
    moveLeadStage
      .mockReset()
      .mockResolvedValue({ opportunity_id: drag.opportunity_id, stage_id: drag.stage_id });
    resolveWorkspaceAccess.mockReset().mockResolvedValue({ status: "resolved", workspace: { context } });
  });

  it("sends the drag through the named operation, carrying the stage it started from", async () => {
    const response = await POST(request(drag), { params: Promise.resolve({ slug }) });
    expect(moveLeadStage).toHaveBeenCalledWith(context, drag);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      opportunity_id: drag.opportunity_id,
      stage_id: drag.stage_id
    });
  });

  it("returns the same 404 when workspace access is absent", async () => {
    resolveWorkspaceAccess.mockResolvedValue({ status: "not-found" });
    const response = await POST(request(drag), { params: Promise.resolve({ slug }) });
    expect(response.status).toBe(404);
    expect(moveLeadStage).not.toHaveBeenCalled();
  });

  it("tells the loser of two concurrent drags that the card already moved", async () => {
    moveLeadStage.mockRejectedValue(new LeadStageMoveError("STAGE_CHANGED"));
    const response = await POST(request(drag), { params: Promise.resolve({ slug }) });
    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Este lead mudou de etapa enquanto você arrastava. Atualize o quadro."
    });
  });

  it("translates each refusal to PT-BR at the web boundary", async () => {
    moveLeadStage.mockRejectedValue(new LeadStageMoveError("OPPORTUNITY_CLOSED"));
    const response = await POST(request(drag), { params: Promise.resolve({ slug }) });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Lead ganho ou perdido não muda de etapa."
    });
  });

  it("refuses a body that is not three identifiers before touching the database", async () => {
    const response = await POST(request({ opportunity_id: drag.opportunity_id }), {
      params: Promise.resolve({ slug })
    });
    expect(response.status).toBe(400);
    expect(moveLeadStage).not.toHaveBeenCalled();
  });
});
