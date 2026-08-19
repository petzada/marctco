import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getWhatsAppConnection = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const resolveWorkspaceAccess = vi.fn();
const headers = vi.fn(() => Promise.resolve(new Headers({ host: "crm.example.com" })));

vi.mock("@marctco/db", () => ({ getWhatsAppConnection }));
vi.mock("next/navigation", () => ({ notFound }));
vi.mock("next/headers", () => ({ headers }));
vi.mock("../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const WhatsAppPage = (await import("./page")).default;
const slug = randomUUID();

function render(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER") {
  resolveWorkspaceAccess.mockResolvedValue({
    status: "resolved",
    workspace: {
      role,
      context: { kind: "user", workspace_id: randomUUID(), user_id: randomUUID(), role }
    }
  });
  return WhatsAppPage({ params: Promise.resolve({ slug }) });
}

describe("WhatsApp integration page", () => {
  beforeEach(() => {
    getWhatsAppConnection.mockReset().mockResolvedValue(null);
    notFound.mockClear();
    resolveWorkspaceAccess.mockReset();
    headers.mockClear();
  });

  it.each(["ATTENDANT", "SUPERVISOR"] as const)("refuses %s on the route itself", async (role) => {
    await expect(render(role)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
    expect(getWhatsAppConnection).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "OWNER"] as const)("reads the named operation for %s", async (role) => {
    await render(role);
    expect(notFound).not.toHaveBeenCalled();
    expect(getWhatsAppConnection).toHaveBeenCalledOnce();
  });
});
