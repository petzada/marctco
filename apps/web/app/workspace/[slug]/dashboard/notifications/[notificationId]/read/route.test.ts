import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markNotificationRead = vi.fn();
const resolveWorkspaceAccess = vi.fn();
vi.mock("@marctco/db", () => ({ markNotificationRead }));
vi.mock("../../../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const { POST } = await import("./route");
const slug = randomUUID();
const notificationId = randomUUID();
const context = {
  kind: "user",
  workspace_id: randomUUID(),
  user_id: randomUUID(),
  role: "MANAGER" as const
};

function render(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER" = "MANAGER") {
  resolveWorkspaceAccess.mockResolvedValue({
    status: "resolved",
    workspace: { role, context: { ...context, role } }
  });
  return POST(new Request("https://app.marctco.test", { method: "POST" }), {
    params: Promise.resolve({ slug, notificationId })
  });
}

describe("POST mark notification read", () => {
  beforeEach(() => {
    markNotificationRead.mockReset().mockResolvedValue({ ok: true });
    resolveWorkspaceAccess.mockReset();
  });

  it("marks through the named operation for Gestão", async () => {
    const response = await render("MANAGER");
    expect(response.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledOnce();
    expect(markNotificationRead).toHaveBeenCalledWith(
      { ...context, role: "MANAGER" },
      expect.objectContaining({ notification_id: notificationId })
    );
  });

  it("returns 200 again when the same notice is marked twice", async () => {
    const first = await render("OWNER");
    const second = await render("OWNER");
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(markNotificationRead).toHaveBeenCalledTimes(2);
  });

  it("refuses Atendente on the route itself, not only by hiding the list", async () => {
    const response = await render("ATTENDANT");
    expect(response.status).toBe(404);
    expect(markNotificationRead).not.toHaveBeenCalled();
  });

  it("returns the same 404 when the notice is outside scope", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      status: "resolved",
      workspace: { role: "SUPERVISOR", context: { ...context, role: "SUPERVISOR" } }
    });
    markNotificationRead.mockRejectedValue(new Error("NOT_VISIBLE"));
    const response = await POST(new Request("https://app.marctco.test", { method: "POST" }), {
      params: Promise.resolve({ slug, notificationId })
    });
    expect(response.status).toBe(404);
  });

  it("returns the same 404 when workspace access is absent", async () => {
    resolveWorkspaceAccess.mockResolvedValue({ status: "not-found" });
    const response = await POST(new Request("https://app.marctco.test", { method: "POST" }), {
      params: Promise.resolve({ slug, notificationId })
    });
    expect(response.status).toBe(404);
    expect(markNotificationRead).not.toHaveBeenCalled();
  });
});
