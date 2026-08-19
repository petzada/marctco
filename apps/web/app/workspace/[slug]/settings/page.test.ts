import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getWorkspaceSettings = vi.fn();
const notFound = vi.fn(() => {
  throw new Error("NEXT_NOT_FOUND");
});
const redirect = vi.fn((destination: string) => {
  throw new Error(`NEXT_REDIRECT ${destination}`);
});
const resolveWorkspaceAccess = vi.fn();

vi.mock("@marctco/db", () => ({ getWorkspaceSettings }));
vi.mock("next/navigation", () => ({ notFound, redirect }));
vi.mock("../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const SettingsPage = (await import("./page")).default;
const slug = randomUUID();

function render(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER" | "OWNER") {
  resolveWorkspaceAccess.mockResolvedValue({
    status: "resolved",
    workspace: {
      role,
      context: { kind: "user", workspace_id: randomUUID(), user_id: randomUUID(), role }
    }
  });
  return SettingsPage({
    params: Promise.resolve({ slug }),
    searchParams: Promise.resolve({})
  });
}

describe("Settings route", () => {
  beforeEach(() => {
    getWorkspaceSettings.mockReset().mockResolvedValue({
      first_contact_sla_minutes: 120,
      stagnation_days: 7,
      first_contact_trigger: "ON_ASSIGNMENT",
      first_contact_template_body:
        "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}."
    });
    notFound.mockClear();
    redirect.mockClear();
    resolveWorkspaceAccess.mockReset();
  });

  it.each(["ATTENDANT", "SUPERVISOR"] as const)("refuses %s on the route itself", async (role) => {
    await expect(render(role)).rejects.toThrow("NEXT_NOT_FOUND");
    expect(notFound).toHaveBeenCalledOnce();
    expect(getWorkspaceSettings).not.toHaveBeenCalled();
  });

  it.each(["MANAGER", "OWNER"] as const)("reads the named operation for %s", async (role) => {
    await render(role);
    expect(notFound).not.toHaveBeenCalled();
    expect(getWorkspaceSettings).toHaveBeenCalledOnce();
  });
});
