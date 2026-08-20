import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserContext } from "@marctco/db";
import type { WhatsMiauClient } from "./whatsmiau-client";

const mocks = vi.hoisted(() => ({
  createWhatsAppConnection: vi.fn(),
  getWhatsAppConnection: vi.fn(),
  setWhatsAppPairingState: vi.fn(),
  commitWhatsAppWebhookSecret: vi.fn(),
  generateIntegrationToken: vi.fn()
}));

vi.mock("@marctco/db", () => ({
  createWhatsAppConnection: mocks.createWhatsAppConnection,
  getWhatsAppConnection: mocks.getWhatsAppConnection,
  setWhatsAppPairingState: mocks.setWhatsAppPairingState,
  commitWhatsAppWebhookSecret: mocks.commitWhatsAppWebhookSecret,
  generateIntegrationToken: mocks.generateIntegrationToken,
  WhatsAppConnectionError: class WhatsAppConnectionError extends Error {
    constructor(readonly code: "FORBIDDEN" | "NOT_FOUND") {
      super(code);
      this.name = "WhatsAppConnectionError";
    }
  }
}));

const {
  connectWhatsAppWorkspace,
  disconnectWhatsAppWorkspace,
  pairWhatsAppWorkspace,
  refreshWhatsAppPairing,
  rotateWhatsAppWebhook,
  WHATSMIAU_WEBHOOK_PATH,
  WhatsAppProviderError
} = await import("./whatsapp-connection-http");

const context = {
  kind: "user",
  workspace_id: "11111111-1111-4111-8111-111111111111",
  user_id: "user-1",
  role: "OWNER"
} as UserContext;
const instance_name = "marctco_11111111111141118111111111111111";
const webhook_url = "https://crm.example.com/api/webhooks/whatsmiau";
const connection = {
  integration_connection_id: "conn-1",
  instance_name,
  status: "ACTIVE" as const,
  pairing_state: "DISCONNECTED" as const,
  created_at: new Date(),
  updated_at: new Date()
};

function clientStub(overrides: Partial<WhatsMiauClient> = {}): WhatsMiauClient {
  return {
    createInstance: vi.fn(),
    setWebhook: vi.fn(),
    connect: vi.fn(),
    connectionState: vi.fn(),
    logout: vi.fn(),
    fetchInstances: vi.fn(),
    ...overrides
  };
}

describe("WhatsApp HTTP orchestration", () => {
  beforeEach(() => {
    for (const mock of Object.values(mocks)) {
      mock.mockReset();
    }
    mocks.setWhatsAppPairingState.mockResolvedValue(undefined);
    mocks.commitWhatsAppWebhookSecret.mockResolvedValue(undefined);
  });

  it("exposes the inbound webhook path used to configure the provider", () => {
    expect(WHATSMIAU_WEBHOOK_PATH).toBe("/api/webhooks/whatsmiau");
  });

  it("refuses a non-public webhook URL before any provider call", async () => {
    const client = clientStub();
    await expect(
      pairWhatsAppWorkspace({
        context,
        webhook_url: "https://localhost/api/webhooks/whatsmiau",
        client
      })
    ).rejects.toMatchObject({ code: "webhook_not_public" });
    expect(mocks.createWhatsAppConnection).not.toHaveBeenCalled();
  });

  it("pairs by issuing the webhook token, then create → webhook/set → connect outside the database", async () => {
    mocks.createWhatsAppConnection.mockResolvedValue({
      ...connection,
      created: true,
      webhook_token: "mtco_once"
    });
    const createInstance = vi.fn().mockResolvedValue(undefined);
    const fetchInstances = vi.fn().mockResolvedValue([]);
    const setWebhook = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn().mockResolvedValue({
      base64: "data:image/png;base64,AAA",
      pairing_code: "ABCD1234"
    });
    const client = clientStub({ createInstance, fetchInstances, setWebhook, connect });

    const paired = await pairWhatsAppWorkspace({ context, webhook_url, client });

    expect(fetchInstances).toHaveBeenCalled();
    expect(createInstance).toHaveBeenCalledWith(instance_name);
    expect(setWebhook).toHaveBeenCalledWith({
      instance_name,
      url: webhook_url,
      bearer_token: "mtco_once"
    });
    expect(connect).toHaveBeenCalledWith(instance_name);
    expect(mocks.commitWhatsAppWebhookSecret).not.toHaveBeenCalled();
    expect(mocks.setWhatsAppPairingState).toHaveBeenCalledWith(context, "QR_PENDING");
    expect(paired).toEqual({
      pairing_state: "QR_PENDING",
      base64: "data:image/png;base64,AAA",
      pairing_code: "ABCD1234",
      instance_name
    });
  });

  it("retries pairing on an existing row by rotating the webhook Bearer before connect", async () => {
    mocks.createWhatsAppConnection.mockResolvedValue({
      ...connection,
      created: false,
      webhook_token: null
    });
    mocks.generateIntegrationToken.mockReturnValue({
      token: "mtco_retry",
      token_hash: "e".repeat(64),
      token_last4: "etry"
    });
    const createInstance = vi.fn().mockRejectedValue(new Error("already exists"));
    const fetchInstances = vi.fn().mockResolvedValue([{ instanceName: instance_name, state: "closed" }]);
    const setWebhook = vi.fn().mockResolvedValue(undefined);
    const connect = vi.fn().mockResolvedValue({
      base64: "data:image/png;base64,CCC",
      pairing_code: null
    });
    const client = clientStub({ createInstance, fetchInstances, setWebhook, connect });

    const paired = await pairWhatsAppWorkspace({ context, webhook_url, client });

    expect(fetchInstances).toHaveBeenCalled();
    expect(createInstance).not.toHaveBeenCalled();
    expect(setWebhook).toHaveBeenCalledWith({
      instance_name,
      url: webhook_url,
      bearer_token: "mtco_retry"
    });
    expect(mocks.commitWhatsAppWebhookSecret).toHaveBeenCalledWith(context, {
      token_hash: "e".repeat(64),
      token_last4: "etry"
    });
    expect(paired.pairing_state).toBe("QR_PENDING");
  });

  it("marks pairing ERROR when the provider fails, without leaking the token", async () => {
    mocks.createWhatsAppConnection.mockResolvedValue({
      ...connection,
      created: true,
      webhook_token: "mtco_secret_token"
    });
    const client = clientStub({
      fetchInstances: vi.fn().mockResolvedValue([]),
      createInstance: vi.fn().mockRejectedValue(new Error("apikey leaked? mtco_secret_token"))
    });

    await expect(pairWhatsAppWorkspace({ context, webhook_url, client })).rejects.toBeInstanceOf(
      WhatsAppProviderError
    );
    expect(mocks.setWhatsAppPairingState).toHaveBeenCalledWith(context, "ERROR");
  });

  it("connects an existing instance once to obtain QR", async () => {
    mocks.getWhatsAppConnection.mockResolvedValue(connection);
    const fetchInstances = vi.fn().mockResolvedValue([{ instanceName: instance_name, state: "closed" }]);
    const connect = vi.fn().mockResolvedValue({
      base64: "data:image/png;base64,BBB",
      pairing_code: null
    });
    const client = clientStub({ fetchInstances, connect });

    const result = await connectWhatsAppWorkspace({ context, client });
    expect(fetchInstances).toHaveBeenCalled();
    expect(connect).toHaveBeenCalledWith(instance_name);
    expect(result.pairing_state).toBe("QR_PENDING");
    expect(mocks.setWhatsAppPairingState).toHaveBeenCalledWith(context, "QR_PENDING");
  });

  it("logs out then stores DISCONNECTED, and does not persist the new hash on a failed rotate", async () => {
    const logout = vi.fn().mockResolvedValue(undefined);
    const setWebhook = vi.fn().mockRejectedValue(new Error("down"));
    const client = clientStub({ logout, setWebhook });
    mocks.getWhatsAppConnection
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce({ ...connection, pairing_state: "DISCONNECTED" });

    await disconnectWhatsAppWorkspace({ context, client });
    expect(logout).toHaveBeenCalledWith(instance_name);
    expect(mocks.setWhatsAppPairingState).toHaveBeenCalledWith(context, "DISCONNECTED");

    mocks.generateIntegrationToken.mockReturnValue({
      token: "mtco_new",
      token_hash: "c".repeat(64),
      token_last4: "wxyz"
    });
    mocks.getWhatsAppConnection.mockResolvedValue(connection);
    await expect(rotateWhatsAppWebhook({ context, webhook_url, client })).rejects.toMatchObject({
      code: "provider_unavailable"
    });
    expect(mocks.commitWhatsAppWebhookSecret).not.toHaveBeenCalled();
  });

  it("publishes the new webhook Bearer before committing the hash", async () => {
    mocks.getWhatsAppConnection.mockResolvedValue(connection);
    mocks.generateIntegrationToken.mockReturnValue({
      token: "mtco_new",
      token_hash: "d".repeat(64),
      token_last4: "abcd"
    });
    const setWebhook = vi.fn().mockResolvedValue(undefined);
    const client = clientStub({ setWebhook });

    await rotateWhatsAppWebhook({ context, webhook_url, client });
    expect(setWebhook).toHaveBeenCalledWith({
      instance_name,
      url: webhook_url,
      bearer_token: "mtco_new"
    });
    expect(mocks.commitWhatsAppWebhookSecret).toHaveBeenCalledWith(context, {
      token_hash: "d".repeat(64),
      token_last4: "abcd"
    });
  });

  it("marks pairing ERROR when connect is requested for an instance missing from the account list", async () => {
    mocks.getWhatsAppConnection.mockResolvedValue(connection);
    const fetchInstances = vi.fn().mockResolvedValue([]);
    const connect = vi.fn();
    const client = clientStub({ fetchInstances, connect });

    await expect(connectWhatsAppWorkspace({ context, client })).rejects.toBeInstanceOf(
      WhatsAppProviderError
    );
    expect(connect).not.toHaveBeenCalled();
    expect(mocks.setWhatsAppPairingState).toHaveBeenCalledWith(context, "ERROR");
  });

  it("polls connectionState and caches the official reading", async () => {
    mocks.getWhatsAppConnection
      .mockResolvedValueOnce(connection)
      .mockResolvedValueOnce({ ...connection, pairing_state: "CONNECTED" });
    const connectionState = vi.fn().mockResolvedValue("CONNECTED");
    const client = clientStub({ connectionState });

    const view = await refreshWhatsAppPairing({ context, client });
    expect(connectionState).toHaveBeenCalledWith(instance_name);
    expect(mocks.setWhatsAppPairingState).toHaveBeenCalledWith(context, "CONNECTED");
    expect(view.pairing_state).toBe("CONNECTED");
  });
});
