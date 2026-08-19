import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  resolveWorkspaceAccess: vi.fn(),
  getWhatsAppConnection: vi.fn(),
  pairWhatsAppWorkspace: vi.fn(),
  connectWhatsAppWorkspace: vi.fn(),
  disconnectWhatsAppWorkspace: vi.fn(),
  rotateWhatsAppWebhook: vi.fn(),
  refreshWhatsAppPairing: vi.fn(),
  createWhatsMiauClient: vi.fn(),
  readWhatsMiauApiKey: vi.fn(),
  publicIntegrationUrl: vi.fn()
}));

vi.mock("./workspace-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess
}));
vi.mock("@marctco/db", () => ({
  getWhatsAppConnection: mocks.getWhatsAppConnection,
  WhatsAppConnectionError: class WhatsAppConnectionError extends Error {
    constructor(readonly code: "FORBIDDEN" | "NOT_FOUND") {
      super(code);
      this.name = "WhatsAppConnectionError";
    }
  }
}));
vi.mock("./whatsapp-connection-http", () => ({
  WHATSMIAU_WEBHOOK_PATH: "/api/webhooks/whatsmiau",
  WhatsAppProviderError: class WhatsAppProviderError extends Error {
    constructor(readonly code: "provider_unavailable" | "webhook_not_public") {
      super(code);
      this.name = "WhatsAppProviderError";
    }
  },
  pairWhatsAppWorkspace: mocks.pairWhatsAppWorkspace,
  connectWhatsAppWorkspace: mocks.connectWhatsAppWorkspace,
  disconnectWhatsAppWorkspace: mocks.disconnectWhatsAppWorkspace,
  rotateWhatsAppWebhook: mocks.rotateWhatsAppWebhook,
  refreshWhatsAppPairing: mocks.refreshWhatsAppPairing
}));
vi.mock("./whatsmiau-client", () => ({
  createWhatsMiauClient: mocks.createWhatsMiauClient,
  readWhatsMiauApiKey: mocks.readWhatsMiauApiKey
}));
vi.mock("./public-origin", () => ({
  publicIntegrationUrl: mocks.publicIntegrationUrl
}));

const {
  GET_WHATSAPP_STATUS,
  POST_WHATSAPP_CONNECT,
  POST_WHATSAPP_DISCONNECT,
  POST_WHATSAPP_PAIR,
  POST_WHATSAPP_ROTATE
} = await import("./whatsapp-connection-routes");

const SLUG = "9c096b1a-6bcc-44cc-bb00-22a72139b26d";
const params = Promise.resolve({ slug: SLUG });
const context = { kind: "user", workspace_id: "workspace-1", user_id: "user-1", role: "OWNER" };
const client = { connect: vi.fn() };

function accessAs(role: string) {
  return {
    status: "resolved",
    workspace: {
      role,
      context: { ...context, role }
    }
  };
}

function request(): Request {
  return new Request(`https://crm.example.com/workspace/${SLUG}/integrations/whatsapp/pair`, {
    method: "POST"
  });
}

describe("WhatsApp connection routes", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    mocks.readWhatsMiauApiKey.mockReturnValue("account-apikey");
    mocks.createWhatsMiauClient.mockReturnValue(client);
    mocks.publicIntegrationUrl.mockReturnValue("https://crm.example.com/api/webhooks/whatsmiau");
  });

  it.each(["ATTENDANT", "SUPERVISOR"] as const)("returns 404 on pair for %s", async (role) => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs(role));
    const response = await POST_WHATSAPP_PAIR(request(), { params });
    expect(response.status).toBe(404);
    expect(mocks.pairWhatsAppWorkspace).not.toHaveBeenCalled();
  });

  it("lets Gestão read status and never returns secret material", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("MANAGER"));
    mocks.getWhatsAppConnection.mockResolvedValue({
      instance_name: "marctco_abc",
      status: "ACTIVE",
      pairing_state: "CONNECTED",
      token_hash: "should-not-leak"
    });
    mocks.refreshWhatsAppPairing.mockResolvedValue({
      instance_name: "marctco_abc",
      status: "ACTIVE",
      pairing_state: "CONNECTED"
    });

    const response = await GET_WHATSAPP_STATUS(request(), { params });
    expect(response.status).toBe(200);
    const body: unknown = await response.json();
    expect(body).toEqual({
      connection: {
        instance_name: "marctco_abc",
        status: "ACTIVE",
        pairing_state: "CONNECTED"
      }
    });
    expect(JSON.stringify(body)).not.toContain("token");
    expect(JSON.stringify(body)).not.toContain("apikey");
    expect(JSON.stringify(body)).not.toContain("should-not-leak");
  });

  it("refuses Gestão on pair, connect, disconnect and rotate", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("MANAGER"));
    expect((await POST_WHATSAPP_PAIR(request(), { params })).status).toBe(404);
    expect((await POST_WHATSAPP_CONNECT(request(), { params })).status).toBe(404);
    expect((await POST_WHATSAPP_DISCONNECT(request(), { params })).status).toBe(404);
    expect((await POST_WHATSAPP_ROTATE(request(), { params })).status).toBe(404);
    expect(mocks.pairWhatsAppWorkspace).not.toHaveBeenCalled();
  });

  it("returns QR fields from pair without the webhook token or apikey", async () => {
    mocks.pairWhatsAppWorkspace.mockResolvedValue({
      pairing_state: "QR_PENDING",
      base64: "data:image/png;base64,AAA",
      pairing_code: "ABCD1234",
      instance_name: "marctco_abc"
    });
    const response = await POST_WHATSAPP_PAIR(request(), { params });
    const body: unknown = await response.json();
    expect(body).toEqual({
      pairing_state: "QR_PENDING",
      base64: "data:image/png;base64,AAA",
      pairing_code: "ABCD1234",
      instance_name: "marctco_abc"
    });
    expect(JSON.stringify(body)).not.toContain("account-apikey");
    expect(JSON.stringify(body)).not.toContain("mtco_");
    expect(mocks.createWhatsMiauClient).toHaveBeenCalledWith({ api_key: "account-apikey" });
  });

  it("fails closed when the account apikey is missing", async () => {
    mocks.readWhatsMiauApiKey.mockReturnValue(null);
    const response = await POST_WHATSAPP_PAIR(request(), { params });
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "provider_unavailable" });
    expect(mocks.pairWhatsAppWorkspace).not.toHaveBeenCalled();
  });
});
