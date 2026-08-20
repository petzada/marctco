/**
 * WhatsApp pairing as a local normalization of the Whatsmiau Cloud API v2
 * surfaces. Administrative connection status (`ACTIVE` / `DISABLED`) lives
 * elsewhere; this module only maps documented provider states.
 */

export const WHATSAPP_PAIRING_STATES = [
  "DISCONNECTED",
  "CONNECTING",
  "QR_PENDING",
  "CONNECTED",
  "SUSPENDED",
  "ERROR"
] as const;

export type WhatsAppPairingState = (typeof WHATSAPP_PAIRING_STATES)[number];

const PAIRING_STATE_SET: ReadonlySet<string> = new Set(WHATSAPP_PAIRING_STATES);

export function isWhatsAppPairingState(value: unknown): value is WhatsAppPairingState {
  return typeof value === "string" && PAIRING_STATE_SET.has(value);
}

export const WHATSMIAU_CREATE_INSTANCE_DEFAULTS = {
  qrcode: false,
  groupsIgnore: true,
  syncFullHistory: false
} as const;

export const WHATSMIAU_WEBHOOK_EVENTS = ["messages.upsert", "connection.update"] as const;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Public `instanceName` used on every v2 route. Stable for a workspace and
 * unique across the Whatsmiau account because it embeds the workspace UUID.
 */
export function whatsAppInstanceNameFor(workspace_id: string): string {
  if (!UUID_PATTERN.test(workspace_id)) {
    throw new Error("WhatsMiau instanceName is derived from a workspace UUID");
  }
  return `marctco_${workspace_id.replaceAll("-", "")}`;
}

export function buildWhatsMiauCreateInstanceBody(instanceName: string): {
  readonly instanceName: string;
  readonly qrcode: false;
  readonly groupsIgnore: true;
  readonly syncFullHistory: false;
} {
  return {
    instanceName,
    ...WHATSMIAU_CREATE_INSTANCE_DEFAULTS
  };
}

export function buildWhatsMiauWebhookSetBody(input: {
  readonly url: string;
  readonly bearer_token: string;
}): {
  readonly webhook: {
    readonly enabled: true;
    readonly url: string;
    readonly events: readonly ["messages.upsert", "connection.update"];
    readonly headers: { readonly Authorization: string };
    readonly byEvents: true;
    readonly base64: false;
  };
} {
  return {
    webhook: {
      enabled: true,
      url: input.url,
      events: WHATSMIAU_WEBHOOK_EVENTS,
      headers: { Authorization: `Bearer ${input.bearer_token}` },
      byEvents: true,
      base64: false
    }
  };
}

/**
 * The provider blocks localhost and private networks on webhook URLs. The
 * CRM refuses the same class of address before calling `/webhook/set`.
 */
export function isPublicHttpsWebhookUrl(url: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== "https:") {
    return false;
  }
  const hostname = parsed.hostname.toLowerCase();
  if (hostname === "localhost" || hostname === "::1" || hostname.endsWith(".localhost")) {
    return false;
  }
  if (isPrivateOrLoopbackIp(hostname)) {
    return false;
  }
  return hostname.includes(".");
}

function isPrivateOrLoopbackIp(hostname: string): boolean {
  if (hostname === "127.0.0.1") {
    return true;
  }
  const ipv4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(hostname);
  if (!ipv4) {
    return false;
  }
  const [a, b] = [Number(ipv4[1]), Number(ipv4[2])];
  return a === 10 || a === 127 || (a === 192 && b === 168) || (a === 172 && b >= 16 && b <= 31);
}

/**
 * Official polling uses `open | closed | connecting | qr-code`; the webhook
 * uses `open | close`. `suspended: true` wins over `closed`. Anything else
 * — including a missing payload — is local ERROR, never a provider value.
 */
export function parseWhatsAppPairingState(payload: unknown): WhatsAppPairingState {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return "ERROR";
  }
  const record = payload as Record<string, unknown>;
  if (record.suspended === true) {
    return "SUSPENDED";
  }
  const state = record.state;
  if (state === "open") {
    return "CONNECTED";
  }
  if (state === "closed" || state === "close") {
    return "DISCONNECTED";
  }
  if (state === "connecting") {
    return "CONNECTING";
  }
  if (state === "qr-code") {
    return "QR_PENDING";
  }
  return "ERROR";
}

export interface WhatsAppConnectReading {
  readonly base64: string | null;
  readonly pairing_code: string | null;
}

export interface WhatsAppFetchedInstance {
  readonly instance_name: string;
  readonly pairing_state: WhatsAppPairingState;
}

/**
 * Documented fields of `GET /instance/fetchInstances`: each row exposes
 * `instanceName` and a connection `state` using the same vocabulary as
 * `connectionState/:name`. Unknown rows are skipped; nothing else is read.
 */
export function parseWhatsAppFetchInstancesPayload(
  payload: unknown
): readonly WhatsAppFetchedInstance[] {
  if (!Array.isArray(payload)) {
    return [];
  }
  const instances: WhatsAppFetchedInstance[] = [];
  for (const item of payload) {
    if (item === null || typeof item !== "object" || Array.isArray(item)) {
      continue;
    }
    const record = item as Record<string, unknown>;
    const instance_name = record.instanceName;
    if (typeof instance_name !== "string" || instance_name === "") {
      continue;
    }
    instances.push({
      instance_name,
      pairing_state: parseWhatsAppPairingState(record)
    });
  }
  return instances;
}

/** Documented optional fields of `GET /instance/connect/:name`. No TTL. */
export function parseWhatsAppConnectPayload(payload: unknown): WhatsAppConnectReading {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    return { base64: null, pairing_code: null };
  }
  const record = payload as Record<string, unknown>;
  return {
    base64: typeof record.base64 === "string" && record.base64 !== "" ? record.base64 : null,
    pairing_code:
      typeof record.pairingCode === "string" && record.pairingCode !== ""
        ? record.pairingCode
        : null
  };
}
