import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  WHATSMIAU_API_BASE_URL,
  createWhatsMiauClient,
  pairWhatsMiauInstance
} from "./whatsmiau-client";

const API_KEY = "account-apikey";
const INSTANCE = "marctco_11111111111141118111111111111111";
const WEBHOOK_URL = "https://crm.example.com/api/webhooks/whatsmiau";
const WEBHOOK_TOKEN = "mtco_opaque";

/**
 * Official contract fixtures. Only fields published by Whatsmiau Cloud API v2
 * appear here; success bodies without a documented schema are treated as 2xx.
 */
const CREATE_RESPONSE = { status: 201, body: { instance: { instanceName: INSTANCE } } };
const WEBHOOK_SET_RESPONSE = { status: 200, body: { webhook: { enabled: true } } };
const CONNECT_RESPONSE = {
  status: 200,
  body: {
    id: "inst-1",
    connected: false,
    base64: "data:image/png;base64,AAA",
    pairingCode: "ABCD1234"
  }
};
const OPEN_STATE = { status: 200, body: { state: "open" } };
const CLOSED_STATE = { status: 200, body: { state: "closed" } };
const CONNECTING_STATE = { status: 200, body: { state: "connecting" } };
const QR_STATE = { status: 200, body: { state: "qr-code" } };
const SUSPENDED_STATE = { status: 200, body: { state: "closed", suspended: true } };
const LOGOUT_RESPONSE = { status: 200, body: {} };
const FETCH_INSTANCES_RESPONSE = {
  status: 200,
  body: [{ instanceName: INSTANCE, state: "open" }]
};

function requestJsonBody(init: RequestInit | undefined): unknown {
  const rawBody = init?.body;
  if (typeof rawBody !== "string") {
    return null;
  }
  return JSON.parse(rawBody) as unknown;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("WhatsMiau HTTP adapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("fixes the v2 base URL and sends apikey on every call", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(CREATE_RESPONSE.status, CREATE_RESPONSE.body))
      .mockResolvedValueOnce(jsonResponse(WEBHOOK_SET_RESPONSE.status, WEBHOOK_SET_RESPONSE.body))
      .mockResolvedValueOnce(jsonResponse(CONNECT_RESPONSE.status, CONNECT_RESPONSE.body))
      .mockResolvedValueOnce(jsonResponse(OPEN_STATE.status, OPEN_STATE.body))
      .mockResolvedValueOnce(jsonResponse(LOGOUT_RESPONSE.status, LOGOUT_RESPONSE.body))
      .mockResolvedValueOnce(jsonResponse(FETCH_INSTANCES_RESPONSE.status, FETCH_INSTANCES_RESPONSE.body));

    const client = createWhatsMiauClient({ api_key: API_KEY, fetch: fetchMock });
    await client.createInstance(INSTANCE);
    await client.setWebhook({ instance_name: INSTANCE, url: WEBHOOK_URL, bearer_token: WEBHOOK_TOKEN });
    await client.connect(INSTANCE);
    await client.connectionState(INSTANCE);
    await client.logout(INSTANCE);
    await client.fetchInstances();

    const calls = fetchMock.mock.calls.map(([input, init]) => ({
      url: String(input),
      method: (init as RequestInit).method,
      apikey: (init as RequestInit).headers
        ? new Headers((init as RequestInit).headers).get("apikey")
        : null
    }));
    expect(calls.every((call) => call.url.startsWith(WHATSMIAU_API_BASE_URL))).toBe(true);
    expect(WHATSMIAU_API_BASE_URL).toBe("https://api.whatsmiau.dev/v2");
    expect(calls.map((call) => call.url.replace(WHATSMIAU_API_BASE_URL, ""))).toEqual([
      "/instance/create",
      `/webhook/set/${INSTANCE}`,
      `/instance/connect/${INSTANCE}`,
      `/instance/connectionState/${INSTANCE}`,
      `/instance/logout/${INSTANCE}`,
      "/instance/fetchInstances"
    ]);
    expect(calls.map((call) => call.method)).toEqual(["POST", "POST", "GET", "GET", "DELETE", "GET"]);
    expect(calls.every((call) => call.apikey === API_KEY)).toBe(true);
  });

  it("pairs by creating without QR, then setting the Bearer webhook, then connecting", async () => {
    const order: string[] = [];
    fetchMock.mockImplementation((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      const body = requestJsonBody(init);
      order.push(url.replace(WHATSMIAU_API_BASE_URL, ""));
      if (url.endsWith("/instance/create")) {
        expect(body).toEqual({
          instanceName: INSTANCE,
          qrcode: false,
          groupsIgnore: true,
          syncFullHistory: false
        });
        return jsonResponse(CREATE_RESPONSE.status, CREATE_RESPONSE.body);
      }
      if (url.endsWith(`/webhook/set/${INSTANCE}`)) {
        expect(body).toEqual({
          webhook: {
            enabled: true,
            url: WEBHOOK_URL,
            events: ["messages.upsert", "connection.update"],
            headers: { Authorization: `Bearer ${WEBHOOK_TOKEN}` },
            byEvents: true,
            base64: false
          }
        });
        return jsonResponse(WEBHOOK_SET_RESPONSE.status, WEBHOOK_SET_RESPONSE.body);
      }
      if (url.endsWith(`/instance/connect/${INSTANCE}`)) {
        return jsonResponse(CONNECT_RESPONSE.status, CONNECT_RESPONSE.body);
      }
      throw new Error(`unexpected ${url}`);
    });

    const paired = await pairWhatsMiauInstance(
      createWhatsMiauClient({ api_key: API_KEY, fetch: fetchMock }),
      { instance_name: INSTANCE, webhook_url: WEBHOOK_URL, bearer_token: WEBHOOK_TOKEN }
    );

    expect(order).toEqual([
      "/instance/create",
      `/webhook/set/${INSTANCE}`,
      `/instance/connect/${INSTANCE}`
    ]);
    expect(paired).toEqual({
      pairing_state: "QR_PENDING",
      base64: "data:image/png;base64,AAA",
      pairing_code: "ABCD1234"
    });
  });

  it("normalizes official connection states including suspension and invalid payloads", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse(OPEN_STATE.status, OPEN_STATE.body))
      .mockResolvedValueOnce(jsonResponse(CLOSED_STATE.status, CLOSED_STATE.body))
      .mockResolvedValueOnce(jsonResponse(CONNECTING_STATE.status, CONNECTING_STATE.body))
      .mockResolvedValueOnce(jsonResponse(QR_STATE.status, QR_STATE.body))
      .mockResolvedValueOnce(jsonResponse(SUSPENDED_STATE.status, SUSPENDED_STATE.body))
      .mockResolvedValueOnce(jsonResponse(200, { nope: true }))
      .mockResolvedValueOnce(jsonResponse(500, { error: "unavailable" }));

    const client = createWhatsMiauClient({ api_key: API_KEY, fetch: fetchMock });
    expect(await client.connectionState(INSTANCE)).toBe("CONNECTED");
    expect(await client.connectionState(INSTANCE)).toBe("DISCONNECTED");
    expect(await client.connectionState(INSTANCE)).toBe("CONNECTING");
    expect(await client.connectionState(INSTANCE)).toBe("QR_PENDING");
    expect(await client.connectionState(INSTANCE)).toBe("SUSPENDED");
    expect(await client.connectionState(INSTANCE)).toBe("ERROR");
    expect(await client.connectionState(INSTANCE)).toBe("ERROR");
  });

  it("never puts the account apikey on a thrown error", async () => {
    fetchMock.mockRejectedValue(new Error(`apikey ${API_KEY} rejected`));
    const client = createWhatsMiauClient({ api_key: API_KEY, fetch: fetchMock });
    await expect(client.createInstance(INSTANCE)).rejects.toThrow(/WhatsMiau request failed/);
    await expect(client.createInstance(INSTANCE)).rejects.not.toThrow(new RegExp(API_KEY));
  });
});
