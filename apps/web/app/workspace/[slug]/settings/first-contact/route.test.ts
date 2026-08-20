import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const updateWorkspaceSettings = vi.fn();

vi.mock("@marctco/db", () => ({
  updateWorkspaceSettings,
  WorkspaceSettingsWriteError: class WorkspaceSettingsWriteError extends Error {
    constructor(readonly code: "FORBIDDEN" | "INVALID") {
      super(code);
      this.name = "WorkspaceSettingsWriteError";
    }
  }
}));
vi.mock("../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess: vi.fn() }));

const { WorkspaceSettingsWriteError } = await import("@marctco/db");
const { resolveWorkspaceAccess } = await import("../../../../../lib/workspace-access");
const { POST } = await import("./route");
const slug = randomUUID();
const managerContext = {
  kind: "user",
  workspace_id: randomUUID(),
  user_id: randomUUID(),
  role: "MANAGER"
};

function request(fields: Record<string, string>) {
  const body = new URLSearchParams(fields);
  return new Request(`https://app.marctco.test/workspace/${slug}/settings/first-contact`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body
  });
}

describe("POST settings first-contact", () => {
  beforeEach(() => {
    updateWorkspaceSettings.mockReset().mockResolvedValue({
      first_contact_sla_minutes: 120,
      stagnation_days: 7,
      first_contact_trigger: "ON_ARRIVAL",
      first_contact_template_body: "Olá {{lead_name}}"
    });
    vi.mocked(resolveWorkspaceAccess).mockReset().mockResolvedValue({
      status: "resolved",
      workspace: { role: "MANAGER", context: managerContext }
    } as never);
  });

  it("writes trigger and template through the named operation", async () => {
    const response = await POST(
      request({
        first_contact_trigger: "ON_ARRIVAL",
        first_contact_template_body: "Olá {{lead_name}}, aqui é a {{workspace_name}}."
      }),
      { params: Promise.resolve({ slug }) }
    );
    expect(updateWorkspaceSettings).toHaveBeenCalledWith(managerContext, {
      first_contact_trigger: "ON_ARRIVAL",
      first_contact_template_body: "Olá {{lead_name}}, aqui é a {{workspace_name}}."
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `/workspace/${slug}/settings?result=first-contact`
    );
  });

  it.each(["ATTENDANT", "SUPERVISOR"] as const)("refuses %s on the route itself", async (role) => {
    vi.mocked(resolveWorkspaceAccess).mockResolvedValue({
      status: "resolved",
      workspace: {
        role,
        context: { ...managerContext, role }
      }
    } as never);
    const response = await POST(
      request({
        first_contact_trigger: "ON_ASSIGNMENT",
        first_contact_template_body: "Olá {{lead_name}}"
      }),
      { params: Promise.resolve({ slug }) }
    );
    expect(response.status).toBe(404);
    expect(updateWorkspaceSettings).not.toHaveBeenCalled();
  });

  it("maps an invalid template to the settings form", async () => {
    updateWorkspaceSettings.mockRejectedValue(new WorkspaceSettingsWriteError("INVALID"));
    const response = await POST(
      request({
        first_contact_trigger: "ON_ARRIVAL",
        first_contact_template_body: "Olá {{attendant_name}}"
      }),
      { params: Promise.resolve({ slug }) }
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `/workspace/${slug}/settings?error=first-contact-invalid`
    );
  });

  it("returns 404 when the named operation refuses the writer", async () => {
    updateWorkspaceSettings.mockRejectedValue(new WorkspaceSettingsWriteError("FORBIDDEN"));
    const response = await POST(
      request({
        first_contact_trigger: "ON_ASSIGNMENT",
        first_contact_template_body: "Olá {{lead_name}}"
      }),
      { params: Promise.resolve({ slug }) }
    );
    expect(response.status).toBe(404);
  });
});
