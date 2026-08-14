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

/**
 * The origin here is a fiction, and that is the point: these assertions used
 * to expect it echoed back in `location`, which is what let the redirects ship
 * pointing at the internal container host. In production the request carries
 * the container's own hostname, never the public one, so any expectation built
 * from this URL was testing the mock rather than the behaviour. The locations
 * below are relative and name no host — see lib/redirect-response.ts.
 */
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
    consumeProvisioningEntitlement.mockReset().mockResolvedValue(true);
  });

  it("sends the marked user to the slug it just provisioned", async () => {
    const response = await POST(provisionRequest());

    expect(provisionWorkspace).toHaveBeenCalledWith({
      owner_user_id: owner,
      workspace_name: "Assessoria Horizonte"
    });
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`/workspace/${slug}`);
  });

  it("spends the right before the workspace exists, never after", async () => {
    const order: string[] = [];
    consumeProvisioningEntitlement.mockImplementation(() => {
      order.push("consume");
      return Promise.resolve(true);
    });
    provisionWorkspace.mockImplementation(() => {
      order.push("provision");
      return Promise.resolve({ workspace_id: randomUUID(), slug });
    });

    await POST(provisionRequest());

    expect(order).toEqual(["consume", "provision"]);
  });

  it("provisions a second workspace when the marked owner already belongs somewhere", async () => {
    listUserWorkspaces.mockResolvedValue([
      { workspace_id: randomUUID(), slug: randomUUID(), name: "Hugs", role: "OWNER" }
    ]);

    const response = await POST(provisionRequest());

    expect(consumeProvisioningEntitlement).toHaveBeenCalledWith(owner);
    expect(provisionWorkspace).toHaveBeenCalledWith({
      owner_user_id: owner,
      workspace_name: "Assessoria Horizonte"
    });
    expect(response.headers.get("location")).toBe(`/workspace/${slug}`);
  });

  it("creates nothing for a login without the right, and does not send them to login", async () => {
    getAuthenticatedSession.mockResolvedValue({ user_id: owner, claims: { app_metadata: {} } });

    const response = await POST(provisionRequest());

    expect(provisionWorkspace).not.toHaveBeenCalled();
    expect(consumeProvisioningEntitlement).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/onboarding");
    expect(response.headers.get("location")).not.toBe("/login");
  });

  it("sends an unmarked active member to the workspace entry flow", async () => {
    getAuthenticatedSession.mockResolvedValue({ user_id: owner, claims: { app_metadata: {} } });
    listUserWorkspaces.mockResolvedValue([
      { workspace_id: randomUUID(), slug: randomUUID(), name: "Hugs", role: "OWNER" }
    ]);

    const response = await POST(provisionRequest());

    expect(consumeProvisioningEntitlement).not.toHaveBeenCalled();
    expect(provisionWorkspace).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/access");
  });

  it("does not provision when the right is already spent", async () => {
    consumeProvisioningEntitlement.mockResolvedValue(false);
    listUserWorkspaces.mockResolvedValue([
      { workspace_id: randomUUID(), slug: randomUUID(), name: "Hugs", role: "OWNER" }
    ]);

    const response = await POST(provisionRequest());

    expect(provisionWorkspace).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/access");
  });

  it("creates nothing when the right cannot be spent", async () => {
    consumeProvisioningEntitlement.mockRejectedValue(new Error("SUPABASE_SERVICE_ROLE_KEY"));

    const response = await POST(provisionRequest());

    expect(provisionWorkspace).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/onboarding?error=configuration");
  });

  it("sends an unauthenticated request to the login screen", async () => {
    getAuthenticatedSession.mockResolvedValue(null);

    const response = await POST(provisionRequest());

    expect(listUserWorkspaces).not.toHaveBeenCalled();
    expect(response.headers.get("location")).toBe("/login");
  });
});
