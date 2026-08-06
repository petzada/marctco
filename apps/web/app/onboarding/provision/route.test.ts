import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getAuthenticatedSession = vi.fn();
const listUserWorkspaces = vi.fn();
const provisionWorkspace = vi.fn();
const consumeProvisioningEntitlement = vi.fn();

vi.mock("@marctco/db", () => ({ listUserWorkspaces, provisionWorkspace }));
vi.mock("../../../lib/supabase/server", () => ({ getAuthenticatedSession }));
vi.mock("../../../lib/supabase/admin", () => ({ consumeProvisioningEntitlement }));

const { POST } = await import("./route");

const owner = randomUUID();
const slug = randomUUID();

function provisionRequest(): Request {
  return new Request("https://app.marctco.test/onboarding/provision", { method: "post" });
}

function entitledSession() {
  return {
    user_id: owner,
    claims: {
      app_metadata: { can_provision_workspace: true, workspace_name: "Assessoria Horizonte" }
    }
  };
}

describe("POST /onboarding/provision", () => {
  beforeEach(() => {
    getAuthenticatedSession.mockReset().mockResolvedValue(entitledSession());
    listUserWorkspaces.mockReset().mockResolvedValue([]);
    provisionWorkspace
      .mockReset()
      .mockResolvedValue({ workspace_id: randomUUID(), slug });
    consumeProvisioningEntitlement.mockReset().mockResolvedValue(undefined);
  });

  it("sends the marked user to the slug it just provisioned", async () => {
    const response = await POST(provisionRequest());

    expect(provisionWorkspace).toHaveBeenCalledWith({
      owner_user_id: owner,
      workspace_name: "Assessoria Horizonte"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(
      `https://app.marctco.test/workspace/${slug}`
    );
  });

  it("spends the right before the workspace exists, never after", async () => {
    const order: string[] = [];
    consumeProvisioningEntitlement.mockImplementation(() => {
      order.push("consume");
      return Promise.resolve();
    });
    provisionWorkspace.mockImplementation(() => {
      order.push("provision");
      return Promise.resolve({ workspace_id: randomUUID(), slug });
    });

    await POST(provisionRequest());

    expect(order).toEqual(["consume", "provision"]);
  });

  it("creates nothing for a login without the right", async () => {
    getAuthenticatedSession.mockResolvedValue({ user_id: owner, claims: { app_metadata: {} } });

    const response = await POST(provisionRequest());

    expect(provisionWorkspace).not.toHaveBeenCalled();
    expect(consumeProvisioningEntitlement).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.marctco.test/onboarding");
  });

  it("creates nothing for a login that already belongs to a workspace", async () => {
    listUserWorkspaces.mockResolvedValue([
      { workspace_id: randomUUID(), slug: randomUUID(), name: "Assessoria", role: "OWNER" }
    ]);

    const response = await POST(provisionRequest());

    expect(provisionWorkspace).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.marctco.test/access");
  });

  it("creates nothing when the right cannot be spent", async () => {
    consumeProvisioningEntitlement.mockRejectedValue(new Error("SUPABASE_SERVICE_ROLE_KEY"));

    const response = await POST(provisionRequest());

    expect(provisionWorkspace).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe(
      "https://app.marctco.test/onboarding?error=configuration"
    );
  });

  it("sends an unauthenticated request to the login screen", async () => {
    getAuthenticatedSession.mockResolvedValue(null);

    const response = await POST(provisionRequest());

    expect(listUserWorkspaces).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("https://app.marctco.test/login");
  });
});
