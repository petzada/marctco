/**
 * WhatsMiau Cloud API v2 inbound envelope. The adapter is closed: it accepts
 * the official unit `{ event, instance, data, date_time }`, extracts the
 * documented message/connection fields, and never downloads media.
 */

import { normalizePhone } from "./intake/phone.js";
import { parseWhatsAppPairingState, type WhatsAppPairingState } from "./whatsapp-pairing.js";

export const INBOUND_MESSAGE_PREVIEW_MAX_CHARS = 140;

const INDIVIDUAL_JID = /^(\d+)@s\.whatsapp\.net$/;
const UNIX_SECONDS_MIN = 946_684_800;
const UNIX_SECONDS_MAX = 4_102_444_800;
const MEDIA_TYPES = new Set([
  "imageMessage",
  "videoMessage",
  "audioMessage",
  "documentMessage",
  "reactionMessage"
]);

export type WhatsMiauInboundIgnoreReason = "echo" | "group" | "unknown_event";

export type WhatsMiauWebhookParse =
  | { readonly kind: "invalid" }
  | { readonly kind: "ignored"; readonly reason: WhatsMiauInboundIgnoreReason; readonly instance: string }
  | {
      readonly kind: "message";
      readonly instance: string;
      readonly instance_id: string | null;
      readonly external_message_id: string;
      readonly destination_e164: string;
      readonly preview: string;
      readonly occurred_at: Date | null;
    }
  | {
      readonly kind: "connection";
      readonly instance: string;
      readonly data_instance: string | null;
      readonly pairing_state: WhatsAppPairingState;
      readonly status_reason: unknown;
    };

export function parseWhatsMiauWebhookEnvelope(raw: unknown): WhatsMiauWebhookParse {
  if (raw === null || typeof raw !== "object" || Array.isArray(raw)) {
    return { kind: "invalid" };
  }
  const envelope = raw as Record<string, unknown>;
  if (typeof envelope.event !== "string" || envelope.event.trim() === "") {
    return { kind: "invalid" };
  }
  if (typeof envelope.instance !== "string" || envelope.instance.trim() === "") {
    return { kind: "invalid" };
  }
  const instance = envelope.instance;
  const date_time = typeof envelope.date_time === "string" ? envelope.date_time : null;

  if (envelope.event === "connection.update") {
    return parseConnectionUpdate(instance, envelope.data);
  }
  if (envelope.event !== "messages.upsert") {
    return { kind: "ignored", reason: "unknown_event", instance };
  }
  return parseMessageUpsert(instance, envelope.data, date_time);
}

function parseConnectionUpdate(instance: string, data: unknown): WhatsMiauWebhookParse {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return {
      kind: "connection",
      instance,
      data_instance: null,
      pairing_state: "ERROR",
      status_reason: null
    };
  }
  const record = data as Record<string, unknown>;
  const data_instance = typeof record.instance === "string" ? record.instance : null;
  return {
    kind: "connection",
    instance,
    data_instance,
    pairing_state: parseWhatsAppPairingState({
      state: record.state,
      suspended: record.suspended
    }),
    status_reason: record.statusReason ?? null
  };
}

function parseMessageUpsert(
  instance: string,
  data: unknown,
  date_time: string | null
): WhatsMiauWebhookParse {
  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return { kind: "invalid" };
  }
  const record = data as Record<string, unknown>;
  const key = record.key;
  if (key === null || typeof key !== "object" || Array.isArray(key)) {
    return { kind: "invalid" };
  }
  const key_record = key as Record<string, unknown>;
  if (key_record.fromMe === true) {
    return { kind: "ignored", reason: "echo", instance };
  }
  if (key_record.fromMe !== false) {
    return { kind: "invalid" };
  }
  if (typeof key_record.remoteJid !== "string") {
    return { kind: "invalid" };
  }
  if (key_record.remoteJid.endsWith("@g.us")) {
    return { kind: "ignored", reason: "group", instance };
  }
  const individual = INDIVIDUAL_JID.exec(key_record.remoteJid);
  if (!individual) {
    return { kind: "invalid" };
  }
  const destination_e164 = normalizePhone(individual[1] ?? "");
  if (destination_e164 === null) {
    return { kind: "invalid" };
  }
  if (typeof key_record.id !== "string" || key_record.id.trim() === "") {
    return { kind: "invalid" };
  }

  const preview = previewOf(record.messageType, record.message);
  if (preview === null) {
    return { kind: "invalid" };
  }

  const instance_id = typeof record.instanceId === "string" ? record.instanceId : null;
  return {
    kind: "message",
    instance,
    instance_id,
    external_message_id: key_record.id,
    destination_e164,
    preview,
    occurred_at: occurredAt(record.messageTimestamp, date_time)
  };
}

function previewOf(message_type: unknown, message: unknown): string | null {
  if (message_type === "conversation") {
    const conversation = messageRecord(message)?.conversation;
    if (typeof conversation !== "string" || conversation === "") {
      return null;
    }
    return truncatePreview(conversation);
  }
  if (typeof message_type !== "string" || !MEDIA_TYPES.has(message_type)) {
    return null;
  }
  const caption = mediaCaption(message_type, message);
  return caption === null
    ? truncatePreview(message_type)
    : truncatePreview(`${message_type}: ${caption}`);
}

function mediaCaption(message_type: string, message: unknown): string | null {
  const record = messageRecord(message);
  if (!record) {
    return null;
  }
  const nested = record[message_type];
  if (nested === null || typeof nested !== "object" || Array.isArray(nested)) {
    return null;
  }
  const caption = (nested as Record<string, unknown>).caption;
  if (typeof caption === "string" && caption !== "") {
    return caption;
  }
  const reaction = (nested as Record<string, unknown>).text;
  if (message_type === "reactionMessage" && typeof reaction === "string" && reaction !== "") {
    return reaction;
  }
  return null;
}

function messageRecord(message: unknown): Record<string, unknown> | null {
  if (message === null || typeof message !== "object" || Array.isArray(message)) {
    return null;
  }
  return message as Record<string, unknown>;
}

function truncatePreview(value: string): string {
  return value.length <= INBOUND_MESSAGE_PREVIEW_MAX_CHARS
    ? value
    : value.slice(0, INBOUND_MESSAGE_PREVIEW_MAX_CHARS);
}

function occurredAt(message_timestamp: unknown, date_time: string | null): Date | null {
  const from_unix = unixSeconds(message_timestamp);
  if (from_unix !== null) {
    return new Date(from_unix * 1000);
  }
  return isoDate(date_time);
}

function unixSeconds(value: unknown): number | null {
  const numeric =
    typeof value === "number"
      ? value
      : typeof value === "string" && value.trim() !== ""
        ? Number(value)
        : NaN;
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) {
    return null;
  }
  if (numeric < UNIX_SECONDS_MIN || numeric > UNIX_SECONDS_MAX) {
    return null;
  }
  return numeric;
}

function isoDate(value: string | null): Date | null {
  if (value === null) {
    return null;
  }
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) {
    return null;
  }
  const seconds = Math.floor(parsed / 1000);
  if (seconds < UNIX_SECONDS_MIN || seconds > UNIX_SECONDS_MAX) {
    return null;
  }
  return new Date(parsed);
}
