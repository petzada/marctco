import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  WHATSAPP_PAIRING_STATES,
  WHATSMIAU_CREATE_INSTANCE_DEFAULTS,
  WHATSMIAU_WEBHOOK_EVENTS,
  buildWhatsMiauCreateInstanceBody,
  buildWhatsMiauWebhookSetBody,
  isPublicHttpsWebhookUrl,
  isWhatsAppPairingState,
  parseWhatsAppConnectPayload,
  parseWhatsAppFetchInstancesPayload,
  parseWhatsAppPairingState,
  whatsAppInstanceNameFor
} from "./whatsapp-pairing.js";

describe("WhatsApp pairing state", () => {
  it("normalizes the official polling states and local ERROR", () => {
    expect(parseWhatsAppPairingState({ state: "open" })).toBe("CONNECTED");
    expect(parseWhatsAppPairingState({ state: "closed" })).toBe("DISCONNECTED");
    expect(parseWhatsAppPairingState({ state: "connecting" })).toBe("CONNECTING");
    expect(parseWhatsAppPairingState({ state: "qr-code" })).toBe("QR_PENDING");
    expect(WHATSAPP_PAIRING_STATES).toEqual([
      "DISCONNECTED",
      "CONNECTING",
      "QR_PENDING",
      "CONNECTED",
      "SUSPENDED",
      "ERROR"
    ]);
  });

  it("maps webhook close to DISCONNECTED and suspended: true to SUSPENDED", () => {
    expect(parseWhatsAppPairingState({ state: "close" })).toBe("DISCONNECTED");
    expect(parseWhatsAppPairingState({ state: "closed", suspended: true })).toBe("SUSPENDED");
    expect(parseWhatsAppPairingState({ suspended: true })).toBe("SUSPENDED");
  });

  it("maps HTTP failure, invalid payload and unknown state to local ERROR", () => {
    expect(parseWhatsAppPairingState(null)).toBe("ERROR");
    expect(parseWhatsAppPairingState("open")).toBe("ERROR");
    expect(parseWhatsAppPairingState({ state: "unknown" })).toBe("ERROR");
    expect(parseWhatsAppPairingState({})).toBe("ERROR");
    expect(isWhatsAppPairingState("CONNECTED")).toBe(true);
    expect(isWhatsAppPairingState("WHATSAPP")).toBe(false);
  });
});

describe("WhatsMiau instance name", () => {
  it("derives a stable globally unique instanceName from the workspace", () => {
    const workspace_id = "11111111-1111-4111-8111-111111111111";
    expect(whatsAppInstanceNameFor(workspace_id)).toBe("marctco_11111111111141118111111111111111");
    expect(whatsAppInstanceNameFor(workspace_id)).toBe(whatsAppInstanceNameFor(workspace_id));
    expect(whatsAppInstanceNameFor(randomUUID())).not.toBe(whatsAppInstanceNameFor(workspace_id));
  });
});

describe("official WhatsMiau request fixtures", () => {
  it("creates an instance without connecting, ignoring groups and full history", () => {
    expect(WHATSMIAU_CREATE_INSTANCE_DEFAULTS).toEqual({
      qrcode: false,
      groupsIgnore: true,
      syncFullHistory: false
    });
    expect(buildWhatsMiauCreateInstanceBody("marctco_abc")).toEqual({
      instanceName: "marctco_abc",
      qrcode: false,
      groupsIgnore: true,
      syncFullHistory: false
    });
  });

  it("configures the webhook with Bearer, byEvents and the two subscribed events", () => {
    expect(WHATSMIAU_WEBHOOK_EVENTS).toEqual(["messages.upsert", "connection.update"]);
    expect(
      buildWhatsMiauWebhookSetBody({
        url: "https://crm.example.com/api/webhooks/whatsmiau",
        bearer_token: "mtco_opaque"
      })
    ).toEqual({
      webhook: {
        enabled: true,
        url: "https://crm.example.com/api/webhooks/whatsmiau",
        events: ["messages.upsert", "connection.update"],
        headers: { Authorization: "Bearer mtco_opaque" },
        byEvents: true,
        base64: false
      }
    });
  });

  it("accepts only a public HTTPS webhook URL", () => {
    expect(isPublicHttpsWebhookUrl("https://crm.example.com/api/webhooks/whatsmiau")).toBe(true);
    expect(isPublicHttpsWebhookUrl("http://crm.example.com/api/webhooks/whatsmiau")).toBe(false);
    expect(isPublicHttpsWebhookUrl("https://localhost/api/webhooks/whatsmiau")).toBe(false);
    expect(isPublicHttpsWebhookUrl("https://127.0.0.1/api/webhooks/whatsmiau")).toBe(false);
    expect(isPublicHttpsWebhookUrl("https://10.0.0.2/api/webhooks/whatsmiau")).toBe(false);
    expect(isPublicHttpsWebhookUrl("/api/webhooks/whatsmiau")).toBe(false);
  });
});

describe("official fetchInstances payload", () => {
  it("reads only documented instanceName and state fields", () => {
    expect(
      parseWhatsAppFetchInstancesPayload([
        { instanceName: "marctco_abc", state: "open" },
        { instanceName: "marctco_def", state: "closed", suspended: true },
        { instanceName: "", state: "open" },
        { nope: true }
      ])
    ).toEqual([
      { instance_name: "marctco_abc", pairing_state: "CONNECTED" },
      { instance_name: "marctco_def", pairing_state: "SUSPENDED" }
    ]);
    expect(parseWhatsAppFetchInstancesPayload(null)).toEqual([]);
    expect(parseWhatsAppFetchInstancesPayload({ instanceName: "solo" })).toEqual([]);
  });
});

describe("official connect payload", () => {
  it("reads optional base64 and pairingCode without inventing a TTL", () => {
    expect(
      parseWhatsAppConnectPayload({
        id: "inst-1",
        connected: false,
        base64: "data:image/png;base64,AAA",
        pairingCode: "ABCD1234"
      })
    ).toEqual({
      base64: "data:image/png;base64,AAA",
      pairing_code: "ABCD1234"
    });
    expect(parseWhatsAppConnectPayload({ connected: true })).toEqual({
      base64: null,
      pairing_code: null
    });
    expect(parseWhatsAppConnectPayload(null)).toEqual({ base64: null, pairing_code: null });
  });
});
