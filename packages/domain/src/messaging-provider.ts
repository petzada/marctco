/**
 * WhatsMiau sendText port. The HTTP adapter lives outside this module; the
 * domain only names the official request and the local failure policy
 * (ADR-0003, ADR-0008).
 */

import type { ChannelOutboundFailureReason } from "./channel-outbound.js";
import { normalizePhone } from "./intake/phone.js";

export const WHATSMIAU_API_BASE_URL = "https://api.whatsmiau.dev/v2";

export interface MessagingProvider {
  sendText(input: {
    readonly instance_name: string;
    readonly number: string;
    readonly text: string;
  }): Promise<SendTextResult>;
}

/**
 * Local classification of a finished HTTP attempt. The API does not publish
 * a success body, error codes, Retry-After or an idempotency key, so this
 * type never carries an external id or a retry hint.
 */
export type SendTextResult =
  | { readonly kind: "accepted" }
  | { readonly kind: "http_error"; readonly status: number }
  | { readonly kind: "timeout" }
  | { readonly kind: "network" };

export interface WhatsMiauSendTextRequest {
  readonly method: "POST";
  readonly path: string;
  readonly body: { readonly number: string; readonly text: string };
}

/**
 * Official `POST /message/sendText/:instance` body. `delay` is omitted on
 * purpose: the 30s wait belongs to the queue, not the provider.
 */
export function buildWhatsMiauSendTextRequest(input: {
  readonly instance_name: string;
  readonly number: string;
  readonly text: string;
}): WhatsMiauSendTextRequest {
  return {
    method: "POST",
    path: `/message/sendText/${encodeURIComponent(input.instance_name)}`,
    body: { number: input.number, text: input.text }
  };
}

/**
 * E.164 persisted in the CRM becomes the digit-only `number` the v2 docs
 * exemplify. Invalid values stay null so the worker can fail closed without
 * sending a guessed destination.
 */
export function whatsMiauDigitsFromE164(value: string): string | null {
  const e164 = normalizePhone(value);
  if (e164 === null) {
    return null;
  }
  return e164.replace(/^\+/, "").replace(/\D/g, "");
}

export function classifySendTextFailure(
  result: Exclude<SendTextResult, { kind: "accepted" }>
): Extract<ChannelOutboundFailureReason, "KNOWN_REFUSAL" | "UNCERTAIN_EXTERNAL"> {
  if (result.kind === "http_error" && result.status >= 400 && result.status < 500) {
    return "KNOWN_REFUSAL";
  }
  return "UNCERTAIN_EXTERNAL";
}
