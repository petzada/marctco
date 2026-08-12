import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  INTEGRATION_SURFACES,
  LANDING_PAGE_SURFACE,
  PLUGA_SURFACE,
  type IntegrationSurface
} from "./integration-surfaces";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceAccess: vi.fn(),
  createIntegrationConnection: vi.fn(),
  getIntegrationConnectionSummary: vi.fn(),
  rotateIntegrationConnectionSecret: vi.fn(),
  setIntegrationConnectionStatus: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock("./workspace-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess
}));
vi.mock("@marctco/db", () => ({
  createIntegrationConnection: mocks.createIntegrationConnection,
  getIntegrationConnectionSummary: mocks.getIntegrationConnectionSummary,
  rotateIntegrationConnectionSecret: mocks.rotateIntegrationConnectionSecret,
  setIntegrationConnectionStatus: mocks.setIntegrationConnectionStatus
}));
vi.mock("./logger", () => ({
  logger: { info: mocks.loggerInfo, error: vi.fn(), warn: vi.fn() }
}));

const { createIntegrationSecretHandler, createIntegrationStatusHandler } = await import(
  "./integration-secret-route"
);

const SLUG = "9c096b1a-6bcc-44cc-bb00-22a72139b26d";
const params = Promise.resolve({ slug: SLUG });

function accessAs(role: string) {
  return {
    status: "resolved",
    workspace: {
      workspace_id: "workspace-1",
      slug: SLUG,
      name: "Assessoria",
      role,
      context: { kind: "user", workspace_id: "workspace-1", user_id: "user-1", role }
    }
  };
}

function secretRequest(body: unknown, raw?: string): Request {
  return new Request(`https://app.marctco.test/workspace/${SLUG}/integrations/x/secret`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: raw ?? JSON.stringify(body)
  });
}

function statusRequest(status: string | null): Request {
  const form = new FormData();
  if (status !== null) {
    form.set("status", status);
  }
  return new Request(`https://app.marctco.test/workspace/${SLUG}/integrations/x/status`, {
    method: "POST",
    body: form
  });
}

describe("integration surfaces", () => {
  it("gives each surface its own provider and its own URL segment", () => {
    const providers = INTEGRATION_SURFACES.map((surface) => surface.provider);
    const segments = INTEGRATION_SURFACES.map((surface) => surface.segment);

    expect(new Set(providers).size).toBe(INTEGRATION_SURFACES.length);
    expect(new Set(segments).size).toBe(INTEGRATION_SURFACES.length);
    expect(LANDING_PAGE_SURFACE.provider).toBe("LANDING_PAGE");
    expect(PLUGA_SURFACE.provider).toBe("PLUGA");
  });
});

describe.each(INTEGRATION_SURFACES)(
  "POST .../integrations/$segment/secret",
  (surface: IntegrationSurface) => {
    const POST = createIntegrationSecretHandler(surface);

    beforeEach(() => {
      vi.clearAllMocks();
      mocks.getIntegrationConnectionSummary.mockResolvedValue(null);
    });

    it("answers 401 when the session is not authenticated", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "unauthenticated" });

      const response = await POST(secretRequest({ action: "generate" }), { params });

      expect(response.status).toBe(401);
      expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
    });

    it("refuses every role below Direção — the secret is account material (ADR-0015)", async () => {
      for (const role of ["ATTENDANT", "SUPERVISOR", "MANAGER"]) {
        mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs(role));

        const response = await POST(secretRequest({ action: "generate" }), { params });

        expect(response.status).toBe(403);
      }
      expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
    });

    it("answers 403 for a workspace the session is not associated with", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "not-found" });

      const response = await POST(secretRequest({ action: "generate" }), { params });

      expect(response.status).toBe(403);
    });

    it("answers 400 for a body that is not JSON and for an action it does not know", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

      const malformed = await POST(secretRequest(null, "not json"), { params });
      const unknown = await POST(secretRequest({ action: "delete" }), { params });

      expect(malformed.status).toBe(400);
      expect(unknown.status).toBe(400);
      expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
    });

    it("creates the connection for this surface's provider and returns the secret once", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
      mocks.createIntegrationConnection.mockResolvedValue({
        integration_connection_id: "connection-1",
        token: "mtco_generated",
        token_last4: "ated"
      });

      const response = await POST(secretRequest({ action: "generate" }), { params });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        token: "mtco_generated",
        token_last4: "ated"
      });
      expect(mocks.getIntegrationConnectionSummary).toHaveBeenCalledWith(
        accessAs("OWNER").workspace.context,
        surface.provider
      );
      expect(mocks.createIntegrationConnection).toHaveBeenCalledWith(
        accessAs("OWNER").workspace.context,
        { provider: surface.provider }
      );
    });

    it("answers 409 rather than minting a second secret when this provider already has one", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
      mocks.getIntegrationConnectionSummary.mockResolvedValue({
        integration_connection_id: "connection-1",
        provider: surface.provider,
        status: "ACTIVE",
        token_last4: "L9rA"
      });

      const response = await POST(secretRequest({ action: "generate" }), { params });

      expect(response.status).toBe(409);
      expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
    });

    it("rotates this surface's provider and leaves the other origin's secret alone", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
      mocks.rotateIntegrationConnectionSecret.mockResolvedValue({
        integration_connection_id: "connection-1",
        token: "mtco_rotated",
        token_last4: "ated"
      });

      const response = await POST(secretRequest({ action: "rotate" }), { params });

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({
        token: "mtco_rotated",
        token_last4: "ated"
      });
      expect(mocks.rotateIntegrationConnectionSecret).toHaveBeenCalledWith(
        accessAs("OWNER").workspace.context,
        surface.provider
      );
    });

    it("never puts the clear secret in the log line", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
      mocks.createIntegrationConnection.mockResolvedValue({
        integration_connection_id: "connection-1",
        token: "mtco_generated",
        token_last4: "ated"
      });

      await POST(secretRequest({ action: "generate" }), { params });

      expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain("mtco_generated");
      expect(mocks.loggerInfo).toHaveBeenCalledWith(
        expect.objectContaining({
          event: "integration_connection_secret",
          result: "generated",
          provider: surface.provider
        })
      );
    });
  }
);

describe.each(INTEGRATION_SURFACES)(
  "POST .../integrations/$segment/status",
  (surface: IntegrationSurface) => {
    const POST = createIntegrationStatusHandler(surface);
    const back = `/workspace/${SLUG}/integrations/${surface.segment}`;

    beforeEach(() => {
      vi.clearAllMocks();
    });

    it("sends an unauthenticated session to the login screen", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "unauthenticated" });

      const response = await POST(statusRequest("DISABLED"), { params });

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe("/login");
      expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
    });

    it("bounces a role below Direção back to the screen without touching the connection", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("MANAGER"));

      const response = await POST(statusRequest("DISABLED"), { params });

      expect(response.headers.get("location")).toBe(back);
      expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
    });

    it("ignores a status it does not know", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

      const missing = await POST(statusRequest(null), { params });
      const bogus = await POST(statusRequest("DELETED"), { params });

      expect(missing.headers.get("location")).toBe(back);
      expect(bogus.headers.get("location")).toBe(back);
      expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
    });

    it("disables and re-enables this surface's provider, returning to its own screen", async () => {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

      const disabled = await POST(statusRequest("DISABLED"), { params });
      const enabled = await POST(statusRequest("ACTIVE"), { params });

      expect(disabled.headers.get("location")).toBe(back);
      expect(enabled.headers.get("location")).toBe(back);
      expect(mocks.setIntegrationConnectionStatus).toHaveBeenNthCalledWith(
        1,
        accessAs("OWNER").workspace.context,
        surface.provider,
        "DISABLED"
      );
      expect(mocks.setIntegrationConnectionStatus).toHaveBeenNthCalledWith(
        2,
        accessAs("OWNER").workspace.context,
        surface.provider,
        "ACTIVE"
      );
    });
  }
);
