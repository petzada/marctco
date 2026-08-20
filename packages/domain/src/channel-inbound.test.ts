import { describe, expect, it } from "vitest";
import {
  INBOUND_MESSAGE_PREVIEW_MAX_CHARS,
  parseWhatsMiauWebhookEnvelope
} from "./channel-inbound.js";

const INSTANCE = "marctco_11111111111141118111111111111111";

function messageEnvelope(
  data: Record<string, unknown>,
  extra: Record<string, unknown> = {}
): Record<string, unknown> {
  return {
    event: "messages.upsert",
    instance: INSTANCE,
    date_time: "2026-08-19T15:00:00.000Z",
    data,
    ...extra
  };
}

describe("parseWhatsMiauWebhookEnvelope", () => {
  it("accepts the official unit envelope and extracts a text conversation", () => {
    const parsed = parseWhatsMiauWebhookEnvelope(
      messageEnvelope({
        key: {
          id: "3EB0OFFICIALTEXT",
          remoteJid: "5511999988888@s.whatsapp.net",
          fromMe: false
        },
        message: { conversation: "Oi, recebi a mensagem" },
        messageType: "conversation",
        messageTimestamp: 1724079600,
        instanceId: INSTANCE
      })
    );

    expect(parsed).toEqual({
      kind: "message",
      instance: INSTANCE,
      instance_id: INSTANCE,
      external_message_id: "3EB0OFFICIALTEXT",
      destination_e164: "+5511999988888",
      preview: "Oi, recebi a mensagem",
      occurred_at: new Date("2024-08-19T15:00:00.000Z")
    });
  });

  it("ignores outbound echo identified by fromMe", () => {
    expect(
      parseWhatsMiauWebhookEnvelope(
        messageEnvelope({
          key: {
            id: "3EB0ECHO",
            remoteJid: "5511999988888@s.whatsapp.net",
            fromMe: true
          },
          message: { conversation: "eco" },
          messageType: "conversation",
          messageTimestamp: 1724079600
        })
      )
    ).toEqual({ kind: "ignored", reason: "echo", instance: INSTANCE });
  });

  it("ignores a group JID", () => {
    expect(
      parseWhatsMiauWebhookEnvelope(
        messageEnvelope({
          key: {
            id: "3EB0GROUP",
            remoteJid: "1203630-group@g.us",
            fromMe: false
          },
          message: { conversation: "grupo" },
          messageType: "conversation",
          messageTimestamp: 1724079600
        })
      )
    ).toEqual({ kind: "ignored", reason: "group", instance: INSTANCE });
  });

  it("ignores an event the webhook is not configured for", () => {
    expect(
      parseWhatsMiauWebhookEnvelope({
        event: "messages.update",
        instance: INSTANCE,
        date_time: "2026-08-19T15:00:00.000Z",
        data: { key: { id: "3EB0STATUS" } }
      })
    ).toEqual({ kind: "ignored", reason: "unknown_event", instance: INSTANCE });
  });

  it("records a generic preview and caption for media without downloading it", () => {
    const parsed = parseWhatsMiauWebhookEnvelope(
      messageEnvelope({
        key: {
          id: "3EB0IMAGE",
          remoteJid: "5511999988888@s.whatsapp.net",
          fromMe: false
        },
        message: {
          imageMessage: {
            caption: "foto do contrato",
            url: "https://example.invalid/secret"
          }
        },
        messageType: "imageMessage",
        messageTimestamp: 1724079600
      })
    );

    expect(parsed).toMatchObject({
      kind: "message",
      external_message_id: "3EB0IMAGE",
      preview: "imageMessage: foto do contrato"
    });
    expect(JSON.stringify(parsed)).not.toContain("example.invalid");
  });

  it("maps connection.update open and close without inventing a statusReason catalog", () => {
    expect(
      parseWhatsMiauWebhookEnvelope({
        event: "connection.update",
        instance: INSTANCE,
        date_time: "2026-08-19T15:00:00.000Z",
        data: { instance: INSTANCE, state: "open", statusReason: 200 }
      })
    ).toEqual({
      kind: "connection",
      instance: INSTANCE,
      data_instance: INSTANCE,
      pairing_state: "CONNECTED",
      status_reason: 200
    });

    expect(
      parseWhatsMiauWebhookEnvelope({
        event: "connection.update",
        instance: INSTANCE,
        date_time: "2026-08-19T15:00:00.000Z",
        data: { instance: INSTANCE, state: "close", statusReason: 401 }
      })
    ).toEqual({
      kind: "connection",
      instance: INSTANCE,
      data_instance: INSTANCE,
      pairing_state: "DISCONNECTED",
      status_reason: 401
    });
  });

  it("treats an unknown connection state as local ERROR and still preserves statusReason", () => {
    expect(
      parseWhatsMiauWebhookEnvelope({
        event: "connection.update",
        instance: INSTANCE,
        date_time: "2026-08-19T15:00:00.000Z",
        data: { instance: INSTANCE, state: "flapping", statusReason: 515 }
      })
    ).toEqual({
      kind: "connection",
      instance: INSTANCE,
      data_instance: INSTANCE,
      pairing_state: "ERROR",
      status_reason: 515
    });
  });

  it("uses validated Unix seconds and falls back to envelope date_time", () => {
    const from_unix = parseWhatsMiauWebhookEnvelope(
      messageEnvelope({
        key: {
          id: "3EB0UNIX",
          remoteJid: "5511999988888@s.whatsapp.net",
          fromMe: false
        },
        message: { conversation: "ping" },
        messageType: "conversation",
        messageTimestamp: 1724079600
      })
    );
    expect(from_unix).toMatchObject({ occurred_at: new Date("2024-08-19T15:00:00.000Z") });

    const from_iso = parseWhatsMiauWebhookEnvelope(
      messageEnvelope({
        key: {
          id: "3EB0ISO",
          remoteJid: "5511999988888@s.whatsapp.net",
          fromMe: false
        },
        message: { conversation: "ping" },
        messageType: "conversation",
        messageTimestamp: 12
      })
    );
    expect(from_iso).toMatchObject({ occurred_at: new Date("2026-08-19T15:00:00.000Z") });
  });

  it("rejects a non-object envelope and a missing event", () => {
    expect(parseWhatsMiauWebhookEnvelope(null)).toEqual({ kind: "invalid" });
    expect(parseWhatsMiauWebhookEnvelope("messages.upsert")).toEqual({ kind: "invalid" });
    expect(parseWhatsMiauWebhookEnvelope({ instance: INSTANCE, data: {}, date_time: "x" })).toEqual({
      kind: "invalid"
    });
  });

  it("truncates a long conversation preview", () => {
    const parsed = parseWhatsMiauWebhookEnvelope(
      messageEnvelope({
        key: {
          id: "3EB0LONG",
          remoteJid: "5511999988888@s.whatsapp.net",
          fromMe: false
        },
        message: { conversation: "a".repeat(INBOUND_MESSAGE_PREVIEW_MAX_CHARS + 40) },
        messageType: "conversation",
        messageTimestamp: 1724079600
      })
    );
    expect(parsed.kind).toBe("message");
    if (parsed.kind !== "message") {
      return;
    }
    expect(parsed.preview).toHaveLength(INBOUND_MESSAGE_PREVIEW_MAX_CHARS);
  });
});
