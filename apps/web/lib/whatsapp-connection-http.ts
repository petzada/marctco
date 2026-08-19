import {
  isPublicHttpsWebhookUrl,
  type WhatsAppPairingState
} from "@marctco/domain";
import {
  commitWhatsAppWebhookSecret,
  createWhatsAppConnection,
  generateIntegrationToken,
  getWhatsAppConnection,
  setWhatsAppPairingState,
  WhatsAppConnectionError,
  type UserContext,
  type WhatsAppConnectionView
} from "@marctco/db";
import type { WhatsMiauClient, WhatsMiauPairingResult } from "./whatsmiau-client";

export const WHATSMIAU_WEBHOOK_PATH = "/api/webhooks/whatsmiau";

export interface WhatsAppPairingSession extends WhatsMiauPairingResult {
  readonly instance_name: string;
}

export class WhatsAppProviderError extends Error {
  constructor(readonly code: "provider_unavailable" | "webhook_not_public") {
    super(code);
    this.name = "WhatsAppProviderError";
  }
}

function assertPublicWebhook(url: string): void {
  if (!isPublicHttpsWebhookUrl(url)) {
    throw new WhatsAppProviderError("webhook_not_public");
  }
}

async function rememberPairing(
  context: UserContext,
  pairing_state: WhatsAppPairingState
): Promise<void> {
  await setWhatsAppPairingState(context, pairing_state);
}

function pairingStateFromConnect(qr: {
  readonly base64: string | null;
  readonly pairing_code: string | null;
}): WhatsAppPairingState {
  return qr.base64 !== null || qr.pairing_code !== null ? "QR_PENDING" : "CONNECTING";
}

/**
 * First pairing: persist the connection, then create → webhook/set → connect
 * outside the transaction (ADR-0006). The webhook token never leaves this
 * function toward the browser.
 *
 * When the row already exists — for example after a provider failure on a prior
 * attempt — a fresh Bearer token is minted, published to `/webhook/set`, and
 * only then committed. Create may already have succeeded on the provider; the
 * API does not document create idempotency, so a repeat create failure is
 * ignored on that retry path only.
 */
export async function pairWhatsAppWorkspace(input: {
  readonly context: UserContext;
  readonly webhook_url: string;
  readonly client: WhatsMiauClient;
}): Promise<WhatsAppPairingSession> {
  assertPublicWebhook(input.webhook_url);
  const connection = await createWhatsAppConnection(input.context);

  const first_token = connection.webhook_token;
  const is_first_insert = first_token !== null;
  let bearer_token: string;
  let commit_secret: { readonly token_hash: string; readonly token_last4: string } | null =
    null;

  if (is_first_insert) {
    bearer_token = first_token;
  } else {
    const generated = generateIntegrationToken();
    bearer_token = generated.token;
    commit_secret = {
      token_hash: generated.token_hash,
      token_last4: generated.token_last4
    };
  }

  try {
    try {
      await input.client.createInstance(connection.instance_name);
    } catch {
      if (is_first_insert) {
        throw new Error("WhatsMiau instance create failed");
      }
    }
    await input.client.setWebhook({
      instance_name: connection.instance_name,
      url: input.webhook_url,
      bearer_token
    });
    if (commit_secret !== null) {
      await commitWhatsAppWebhookSecret(input.context, commit_secret);
    }
    const qr = await input.client.connect(connection.instance_name);
    const pairing_state = pairingStateFromConnect(qr);
    await rememberPairing(input.context, pairing_state);
    return {
      pairing_state,
      base64: qr.base64,
      pairing_code: qr.pairing_code,
      instance_name: connection.instance_name
    };
  } catch {
    await rememberPairing(input.context, "ERROR");
    throw new WhatsAppProviderError("provider_unavailable");
  }
}

/** Refresh QR or reconnect an instance that already exists. One connect call. */
export async function connectWhatsAppWorkspace(input: {
  readonly context: UserContext;
  readonly client: WhatsMiauClient;
}): Promise<WhatsAppPairingSession> {
  const connection = await getWhatsAppConnection(input.context);
  if (connection === null) {
    throw new WhatsAppConnectionError("NOT_FOUND");
  }
  try {
    const qr = await input.client.connect(connection.instance_name);
    const pairing_state = pairingStateFromConnect(qr);
    await rememberPairing(input.context, pairing_state);
    return {
      pairing_state,
      base64: qr.base64,
      pairing_code: qr.pairing_code,
      instance_name: connection.instance_name
    };
  } catch {
    await rememberPairing(input.context, "ERROR");
    throw new WhatsAppProviderError("provider_unavailable");
  }
}

export async function disconnectWhatsAppWorkspace(input: {
  readonly context: UserContext;
  readonly client: WhatsMiauClient;
}): Promise<WhatsAppConnectionView> {
  const connection = await getWhatsAppConnection(input.context);
  if (connection === null) {
    throw new WhatsAppConnectionError("NOT_FOUND");
  }
  try {
    await input.client.logout(connection.instance_name);
    await rememberPairing(input.context, "DISCONNECTED");
  } catch {
    await rememberPairing(input.context, "ERROR");
    throw new WhatsAppProviderError("provider_unavailable");
  }
  const updated = await getWhatsAppConnection(input.context);
  if (updated === null) {
    throw new WhatsAppConnectionError("NOT_FOUND");
  }
  return updated;
}

/**
 * Publish the new Bearer token to the provider first; only then persist the
 * hash. A failed HTTP call leaves the previous hash valid.
 */
export async function rotateWhatsAppWebhook(input: {
  readonly context: UserContext;
  readonly webhook_url: string;
  readonly client: WhatsMiauClient;
}): Promise<void> {
  assertPublicWebhook(input.webhook_url);
  const connection = await getWhatsAppConnection(input.context);
  if (connection === null) {
    throw new WhatsAppConnectionError("NOT_FOUND");
  }
  const generated = generateIntegrationToken();
  try {
    await input.client.setWebhook({
      instance_name: connection.instance_name,
      url: input.webhook_url,
      bearer_token: generated.token
    });
  } catch {
    throw new WhatsAppProviderError("provider_unavailable");
  }
  await commitWhatsAppWebhookSecret(input.context, {
    token_hash: generated.token_hash,
    token_last4: generated.token_last4
  });
}

export async function refreshWhatsAppPairing(input: {
  readonly context: UserContext;
  readonly client: WhatsMiauClient;
}): Promise<WhatsAppConnectionView> {
  const connection = await getWhatsAppConnection(input.context);
  if (connection === null) {
    throw new WhatsAppConnectionError("NOT_FOUND");
  }
  try {
    const pairing_state = await input.client.connectionState(connection.instance_name);
    await rememberPairing(input.context, pairing_state);
  } catch {
    await rememberPairing(input.context, "ERROR");
  }
  const updated = await getWhatsAppConnection(input.context);
  if (updated === null) {
    throw new WhatsAppConnectionError("NOT_FOUND");
  }
  return updated;
}
