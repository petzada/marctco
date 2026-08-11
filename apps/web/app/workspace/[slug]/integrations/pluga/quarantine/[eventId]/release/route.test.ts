import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceAccess: vi.fn(),
  releaseQuarantinedLead: vi.fn(),
  loggerInfo: vi.fn(),
  loggerError: vi.fn()
}));

vi.mock("../../../../../../../../lib/workspace-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess
}));
vi.mock("../../../../../../../../lib/release-quarantined-lead", () => ({
  releaseQuarantinedLead: mocks.releaseQuarantinedLead
}));
vi.mock("../../../../../../../../lib/logger", () => ({
  logger: { info: mocks.loggerInfo, error: mocks.loggerError, warn: vi.fn() }
}));

const { POST } = await import("./route");

function releaseRequest(body: unknown): Request {
  return new Request("https://app.marctco.test/workspace/w/integrations/pluga/quarantine/e/release", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

const params = Promise.resolve({ slug: "workspace-slug", eventId: "event-1" });
const managerAccess = {
  status: "resolved",
  workspace: {
    workspace_id: "workspace-1",
    slug: "workspace-slug",
    name: "Assessoria",
    role: "MANAGER",
    context: { kind: "user", workspace_id: "workspace-1", user_id: "user-1", role: "MANAGER" }
  }
};

describe("POST .../quarantine/[eventId]/release", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("refuses ATTENDANT and SUPERVISOR — quarantine release is Gestão and up (ADR-0015)", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({
      status: "resolved",
      workspace: { ...managerAccess.workspace, role: "ATTENDANT" }
    });

    const response = await POST(
      releaseRequest({ name: "Maria", phone: "11987654321", email: "", cpf: "" }),
      { params }
    );

    expect(response.status).toBe(403);
    expect(mocks.releaseQuarantinedLead).not.toHaveBeenCalled();
  });

  it("answers 401 when the session is not authenticated", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "unauthenticated" });

    const response = await POST(
      releaseRequest({ name: "Maria", phone: "11987654321", email: "", cpf: "" }),
      { params }
    );

    expect(response.status).toBe(401);
  });

  it("refuses with 422 when neither phone nor e-mail were provided, without calling the release path", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(managerAccess);

    const response = await POST(
      releaseRequest({ name: "Maria", phone: "", email: "", cpf: "" }),
      { params }
    );

    expect(response.status).toBe(422);
    expect(mocks.releaseQuarantinedLead).not.toHaveBeenCalled();
  });

  it("calls the release path with the event id, the completion, and the current instant", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(managerAccess);
    mocks.releaseQuarantinedLead.mockResolvedValue({
      kind: "NEW_OPPORTUNITY",
      opportunity_id: "opp-1",
      person_id: "person-1"
    });

    const before = Date.now();
    const response = await POST(
      releaseRequest({ name: "Maria", phone: "11987654321", email: "maria@exemplo.com", cpf: "" }),
      { params }
    );
    const after = Date.now();

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", kind: "NEW_OPPORTUNITY" });

    expect(mocks.releaseQuarantinedLead).toHaveBeenCalledTimes(1);
    const [context, input, now] = mocks.releaseQuarantinedLead.mock.calls[0] as [
      unknown,
      { integration_event_id: string; completion: Record<string, string> },
      Date
    ];
    expect(context).toBe(managerAccess.workspace.context);
    expect(input).toEqual({
      integration_event_id: "event-1",
      completion: { name: "Maria", phone: "11987654321", email: "maria@exemplo.com", cpf: "" }
    });
    expect(now.getTime()).toBeGreaterThanOrEqual(before);
    expect(now.getTime()).toBeLessThanOrEqual(after);
  });

  it("reports a release that stayed QUARANTINE without treating it as an error", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(managerAccess);
    mocks.releaseQuarantinedLead.mockResolvedValue({ kind: "QUARANTINE" });

    const response = await POST(
      releaseRequest({ name: "Maria", phone: "11987654321", email: "", cpf: "" }),
      { params }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok", kind: "QUARANTINE" });
  });
});
