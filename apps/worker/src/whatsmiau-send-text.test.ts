import { beforeEach, describe, expect, it, vi } from "vitest";
import { WHATSMIAU_API_BASE_URL, createWhatsMiauMessagingProvider } from "./whatsmiau-send-text.js";

const API_KEY = "account-apikey";
const INSTANCE = "marctco_11111111111141118111111111111111";
const NUMBER = "5511987654321";
const TEXT = "Olá Maria, sou Ana da Assessoria Horizonte.";

/**
 * Official contract fixture: only published sendText request fields.
 * Success/error bodies are local policy — the v2 docs do not publish them.
 */
const OFFICIAL_SEND_TEXT = {
  url: `${WHATSMIAU_API_BASE_URL}/message/sendText/${INSTANCE}`,
  method: "POST",
  body: { number: NUMBER, text: TEXT }
};

function jsonResponse(status: number, body: unknown = null): Response {
  if (body === null) {
    return new Response(null, { status });
  }
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

describe("WhatsMiau sendText adapter", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
  });

  it("posts the official sendText request with apikey and omits delay", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200));
    const provider = createWhatsMiauMessagingProvider({ api_key: API_KEY, fetch: fetchMock });

    await expect(
      provider.sendText({ instance_name: INSTANCE, number: NUMBER, text: TEXT })
    ).resolves.toEqual({ kind: "accepted" });

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(OFFICIAL_SEND_TEXT.url);
    expect(init.method).toBe(OFFICIAL_SEND_TEXT.method);
    expect(new Headers(init.headers).get("apikey")).toBe(API_KEY);
    expect(typeof init.body).toBe("string");
    expect(JSON.parse(init.body as string)).toEqual(OFFICIAL_SEND_TEXT.body);
    expect(init.body as string).not.toContain("delay");
  });

  it("treats any HTTP 2xx as local acceptance without reading an external id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(201, { unexpected: "not-a-contract" }));
    const provider = createWhatsMiauMessagingProvider({ api_key: API_KEY, fetch: fetchMock });
    await expect(
      provider.sendText({ instance_name: INSTANCE, number: NUMBER, text: TEXT })
    ).resolves.toEqual({ kind: "accepted" });
  });

  it("maps a synthetic 4xx to http_error without inventing Retry-After", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400));
    const provider = createWhatsMiauMessagingProvider({ api_key: API_KEY, fetch: fetchMock });
    await expect(
      provider.sendText({ instance_name: INSTANCE, number: NUMBER, text: TEXT })
    ).resolves.toEqual({ kind: "http_error", status: 400 });
  });

  it("maps a synthetic 5xx to http_error", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(500));
    const provider = createWhatsMiauMessagingProvider({ api_key: API_KEY, fetch: fetchMock });
    await expect(
      provider.sendText({ instance_name: INSTANCE, number: NUMBER, text: TEXT })
    ).resolves.toEqual({ kind: "http_error", status: 500 });
  });

  it("maps an aborted fetch to timeout", async () => {
    fetchMock.mockRejectedValueOnce(new DOMException("The operation was aborted.", "AbortError"));
    const provider = createWhatsMiauMessagingProvider({ api_key: API_KEY, fetch: fetchMock });
    await expect(
      provider.sendText({ instance_name: INSTANCE, number: NUMBER, text: TEXT })
    ).resolves.toEqual({ kind: "timeout" });
  });

  it("maps a network failure to network and never echoes the apikey", async () => {
    fetchMock.mockRejectedValueOnce(new Error(`apikey ${API_KEY} ECONNREFUSED`));
    const provider = createWhatsMiauMessagingProvider({ api_key: API_KEY, fetch: fetchMock });
    const result = await provider.sendText({
      instance_name: INSTANCE,
      number: NUMBER,
      text: TEXT
    });
    expect(result).toEqual({ kind: "network" });
  });
});
