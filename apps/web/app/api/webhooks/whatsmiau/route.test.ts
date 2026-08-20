import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveWorkspaceByIntegrationToken = vi.fn();
const recordWhatsAppInbound = vi.fn();
const hashIntegrationToken = vi.fn((token: string) => `hash:${token}`);
const integrationTokenHashesEqual = vi.fn(() => false);

vi.mock("@marctco/db", () => ({
  resolveWorkspaceByIntegrationToken,
  recordWhatsAppInbound,
  hashIntegrationToken,
  integrationTokenHashesEqual
}));

const { OPTIONS, POST } = await import("./route");

const workspace_id = randomUUID();
const integration_connection_id = randomUUID();

function webhookRequest(init: { token?: string; body?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.token !== undefined) {
    headers.set("authorization", `Bearer ${init.token}`);
  }
  return new Request("https://app.marctco.test/api/webhooks/whatsmiau", {
    method: "POST",
    headers,
    body: init.body ?? JSON.stringify({ event: "messages.upsert", instance: "marctco", data: {}, date_time: "2026-08-19T16:00:00.000Z" })
  });
}

describe("POST /api/webhooks/whatsmiau", () => {
  beforeEach(() => {
    resolveWorkspaceByIntegrationToken.mockReset().mockResolvedValue({
      workspace_id,
      integration_connection_id
    });
    recordWhatsAppInbound.mockReset().mockResolvedValue({ kind: "recorded", opportunity_id: randomUUID(), fact_id: randomUUID() });
    hashIntegrationToken.mockClear();
    integrationTokenHashesEqual.mockClear();
  });

  it("returns 401 without recording a fact when the bearer token is unknown", async () => {
    resolveWorkspaceByIntegrationToken.mockResolvedValue(null);
    const response = await POST(webhookRequest({ token: "mtco_unknown" }));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ status: "unauthorized" });
    expect(recordWhatsAppInbound).not.toHaveBeenCalled();
    expect(integrationTokenHashesEqual).toHaveBeenCalled();
  });

  it("returns 401 when the header is missing", async () => {
    const response = await POST(webhookRequest());
    expect(response.status).toBe(401);
    expect(recordWhatsAppInbound).not.toHaveBeenCalled();
  });

  it("accepts a persisted inbound with 200 after the token resolves the workspace", async () => {
    const envelope = { event: "messages.upsert", instance: "marctco_x", data: { key: { id: "3EB0" } }, date_time: "2026-08-19T16:00:00.000Z" };
    const response = await POST(
      webhookRequest({ token: "mtco_whatsmiau", body: JSON.stringify(envelope) })
    );
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(recordWhatsAppInbound).toHaveBeenCalledWith({
      workspace_id,
      integration_connection_id,
      token: "mtco_whatsmiau",
      envelope
    });
  });

  it("answers 200 after a safe discard including invalid JSON", async () => {
    const invalid_json = await POST(
      webhookRequest({ token: "mtco_whatsmiau", body: "not json" })
    );
    expect(invalid_json.status).toBe(200);
    expect(recordWhatsAppInbound).not.toHaveBeenCalled();

    recordWhatsAppInbound.mockResolvedValue({ kind: "ignored", reason: "echo" });
    const ignored = await POST(webhookRequest({ token: "mtco_whatsmiau" }));
    expect(ignored.status).toBe(200);
  });

  it("does not enable browser CORS", () => {
    const preflight = OPTIONS();
    expect(preflight.status).toBe(405);
    expect(preflight.headers.get("allow")).toBe("POST");
    expect(preflight.headers.has("access-control-allow-origin")).toBe(false);
  });
});
