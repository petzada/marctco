import {
  WHATSMIAU_API_BASE_URL,
  buildWhatsMiauSendTextRequest,
  type MessagingProvider,
  type SendTextResult
} from "@marctco/domain";

export { WHATSMIAU_API_BASE_URL };

/** Local hung-socket limit. The API does not document a timeout. */
const LOCAL_SEND_TEXT_TIMEOUT_MS = 30_000;

export function readWhatsMiauApiKey(env: NodeJS.ProcessEnv = process.env): string | null {
  const value = env.WHATSMIAU_APIKEY?.trim();
  return value ? value : null;
}

export function createWhatsMiauMessagingProvider(input: {
  readonly api_key: string;
  readonly fetch?: typeof fetch;
}): MessagingProvider {
  const fetchImpl = input.fetch ?? fetch;
  const api_key = input.api_key;

  return {
    async sendText({ instance_name, number, text }) {
      const request = buildWhatsMiauSendTextRequest({ instance_name, number, text });
      let response: Response;
      try {
        response = await fetchImpl(`${WHATSMIAU_API_BASE_URL}${request.path}`, {
          method: request.method,
          headers: {
            apikey: api_key,
            "content-type": "application/json"
          },
          body: JSON.stringify(request.body),
          signal: AbortSignal.timeout(LOCAL_SEND_TEXT_TIMEOUT_MS)
        });
      } catch (error: unknown) {
        return classifyTransportFailure(error);
      }

      if (response.ok) {
        return { kind: "accepted" };
      }
      return { kind: "http_error", status: response.status };
    }
  };
}

function classifyTransportFailure(error: unknown): SendTextResult {
  if (isAbortLike(error)) {
    return { kind: "timeout" };
  }
  return { kind: "network" };
}

function isAbortLike(error: unknown): boolean {
  if (typeof error !== "object" || error === null) {
    return false;
  }
  const name = "name" in error ? error.name : undefined;
  return name === "AbortError" || name === "TimeoutError";
}
