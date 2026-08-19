import {
  buildWhatsMiauCreateInstanceBody,
  buildWhatsMiauWebhookSetBody,
  parseWhatsAppConnectPayload,
  parseWhatsAppPairingState,
  type WhatsAppConnectReading,
  type WhatsAppPairingState
} from "@marctco/domain";

export const WHATSMIAU_API_BASE_URL = "https://api.whatsmiau.dev/v2";

export class WhatsMiauRequestError extends Error {
  constructor() {
    super("WhatsMiau request failed");
    this.name = "WhatsMiauRequestError";
  }
}

export interface WhatsMiauClient {
  createInstance(instance_name: string): Promise<void>;
  setWebhook(input: {
    readonly instance_name: string;
    readonly url: string;
    readonly bearer_token: string;
  }): Promise<void>;
  connect(instance_name: string): Promise<WhatsAppConnectReading>;
  connectionState(instance_name: string): Promise<WhatsAppPairingState>;
  logout(instance_name: string): Promise<void>;
  fetchInstances(): Promise<unknown>;
}

export function createWhatsMiauClient(input: {
  readonly api_key: string;
  readonly fetch?: typeof fetch;
}): WhatsMiauClient {
  const fetchImpl = input.fetch ?? fetch;
  const api_key = input.api_key;

  async function request(path: string, method: "GET" | "POST" | "DELETE", body?: unknown): Promise<{
    readonly ok: boolean;
    readonly status: number;
    readonly payload: unknown;
  }> {
    let response: Response;
    try {
      response = await fetchImpl(`${WHATSMIAU_API_BASE_URL}${path}`, {
        method,
        headers: {
          apikey: api_key,
          ...(body === undefined ? {} : { "content-type": "application/json" })
        },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    } catch {
      throw new WhatsMiauRequestError();
    }

    let payload: unknown = null;
    const raw = await response.text();
    if (raw !== "") {
      try {
        payload = JSON.parse(raw);
      } catch {
        payload = null;
      }
    }
    return { ok: response.ok, status: response.status, payload };
  }

  return {
    async createInstance(instance_name) {
      const result = await request("/instance/create", "POST", buildWhatsMiauCreateInstanceBody(instance_name));
      if (!result.ok) {
        throw new WhatsMiauRequestError();
      }
    },
    async setWebhook({ instance_name, url, bearer_token }) {
      const result = await request(
        `/webhook/set/${encodeURIComponent(instance_name)}`,
        "POST",
        buildWhatsMiauWebhookSetBody({ url, bearer_token })
      );
      if (!result.ok) {
        throw new WhatsMiauRequestError();
      }
    },
    async connect(instance_name) {
      const result = await request(`/instance/connect/${encodeURIComponent(instance_name)}`, "GET");
      if (!result.ok) {
        throw new WhatsMiauRequestError();
      }
      return parseWhatsAppConnectPayload(result.payload);
    },
    async connectionState(instance_name) {
      const result = await request(
        `/instance/connectionState/${encodeURIComponent(instance_name)}`,
        "GET"
      );
      if (!result.ok) {
        return "ERROR";
      }
      return parseWhatsAppPairingState(result.payload);
    },
    async logout(instance_name) {
      const result = await request(`/instance/logout/${encodeURIComponent(instance_name)}`, "DELETE");
      if (!result.ok) {
        throw new WhatsMiauRequestError();
      }
    },
    async fetchInstances() {
      const result = await request("/instance/fetchInstances", "GET");
      if (!result.ok) {
        throw new WhatsMiauRequestError();
      }
      return result.payload;
    }
  };
}

export interface WhatsMiauPairingResult extends WhatsAppConnectReading {
  readonly pairing_state: WhatsAppPairingState;
}

/**
 * Safe pairing order: the instance is created without connecting, the webhook
 * is authenticated, and only then does `/instance/connect/:name` return QR.
 */
export async function pairWhatsMiauInstance(
  client: WhatsMiauClient,
  input: {
    readonly instance_name: string;
    readonly webhook_url: string;
    readonly bearer_token: string;
  }
): Promise<WhatsMiauPairingResult> {
  await client.createInstance(input.instance_name);
  await client.setWebhook({
    instance_name: input.instance_name,
    url: input.webhook_url,
    bearer_token: input.bearer_token
  });
  const qr = await client.connect(input.instance_name);
  return {
    pairing_state: qr.base64 !== null || qr.pairing_code !== null ? "QR_PENDING" : "CONNECTING",
    base64: qr.base64,
    pairing_code: qr.pairing_code
  };
}

export function readWhatsMiauApiKey(
  env: NodeJS.ProcessEnv = process.env
): string | null {
  const value = env.WHATSMIAU_APIKEY?.trim();
  return value ? value : null;
}
