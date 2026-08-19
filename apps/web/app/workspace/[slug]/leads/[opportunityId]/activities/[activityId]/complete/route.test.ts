import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const completeActivity = vi.fn();
const resolveWorkspaceAccess = vi.fn();
vi.mock("@marctco/db", () => ({ completeActivity }));
vi.mock("../../../../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const { POST } = await import("./route");
const slug = randomUUID();
const opportunityId = randomUUID();
const activityId = randomUUID();
const context = { kind: "user", workspace_id: randomUUID(), user_id: randomUUID(), role: "ATTENDANT" };

describe("POST complete activity", () => {
  beforeEach(() => {
    completeActivity.mockReset().mockResolvedValue({ id: activityId, status: "DONE" });
    resolveWorkspaceAccess.mockReset().mockResolvedValue({
      status: "resolved",
      workspace: { context }
    });
  });

  it("completes through the named operation and translates a double-complete", async () => {
    const ok = await POST(new Request("https://app.marctco.test", { method: "POST" }), {
      params: Promise.resolve({ slug, opportunityId, activityId })
    });
    expect(completeActivity).toHaveBeenCalledWith(context, activityId);
    expect(ok.status).toBe(200);

    completeActivity.mockRejectedValue(new Error("ALREADY_DONE"));
    const refused = await POST(new Request("https://app.marctco.test", { method: "POST" }), {
      params: Promise.resolve({ slug, opportunityId, activityId })
    });
    await expect(refused.json()).resolves.toEqual({ error: "Esta atividade já foi concluída." });
  });
});
