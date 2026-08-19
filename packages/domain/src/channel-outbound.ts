/**
 * Planning and the closed state machine for one automatic WhatsApp outbound
 * attempt. Recording the outbox is a named operation; this module only
 * decides whether an intention is born, queued, or terminal, and which
 * transitions remain legal after that (ADR-0003, ADR-0007).
 */

import {
  planFirstContactDispatch,
  renderFirstContactTemplate,
  type FirstContactDispatchRefusal,
  type FirstContactTrigger
} from "./first-contact.js";
import { whatsMiauDigitsFromE164 } from "./messaging-provider.js";
import type { WhatsAppPairingState } from "./whatsapp-pairing.js";

export const CHANNEL_OUTBOUND_KIND = "AUTO_FIRST_CONTACT" as const;
export type ChannelOutboundKind = typeof CHANNEL_OUTBOUND_KIND;

/** Publication lease held by `claim_pending_channel_attempts`. Recoverable. */
export const CHANNEL_OUTBOUND_DISPATCH_LEASE_MS = 2 * 60 * 1000;

/** Processing lease. Expiry while PROCESSING is FAILED, never re-queued. */
export const CHANNEL_OUTBOUND_PROCESSING_LEASE_MS = 5 * 60 * 1000;

export const CHANNEL_OUTBOUND_DISPATCH_STATUSES = ["PENDING", "DISPATCHED"] as const;
export type ChannelOutboundDispatchStatus = (typeof CHANNEL_OUTBOUND_DISPATCH_STATUSES)[number];

export const CHANNEL_OUTBOUND_DELIVERY_STATUSES = [
  "QUEUED",
  "PROCESSING",
  "SENT",
  "FAILED"
] as const;
export type ChannelOutboundDeliveryStatus = (typeof CHANNEL_OUTBOUND_DELIVERY_STATUSES)[number];

export const CHANNEL_OUTBOUND_FAILURE_REASONS = [
  "INSTANCE_NOT_CONNECTED",
  "ATTENDANT_PHONE_MISSING",
  "KNOWN_REFUSAL",
  "UNCERTAIN_EXTERNAL"
] as const;
export type ChannelOutboundFailureReason = (typeof CHANNEL_OUTBOUND_FAILURE_REASONS)[number];

export type FirstContactAttemptRefusal =
  | FirstContactDispatchRefusal
  | "TRIGGER_MISMATCH"
  | "ALREADY_ATTEMPTED";

export type FirstContactAttemptPlan =
  | { readonly kind: "NONE"; readonly reason: FirstContactAttemptRefusal }
  | { readonly kind: "QUEUE" }
  | { readonly kind: "FAIL"; readonly reason: "INSTANCE_NOT_CONNECTED" | "ATTENDANT_PHONE_MISSING" };

/**
 * Guard order is flag → trigger → opt-in → eligibility → dedupe →
 * operational preconditions. Flag/incompatible trigger/opt-in/phone/closed
 * or merged produce no intention; a disconnected instance or a missing
 * attendant phone on assignment produce an observable terminal failure.
 */
export function planFirstContactAttempt(input: {
  readonly feature_flag_enabled: boolean;
  readonly trigger: FirstContactTrigger;
  readonly occurred_trigger: Exclude<FirstContactTrigger, "DISABLED">;
  readonly whatsapp_opt_in: boolean | null;
  readonly missing_phone: boolean;
  readonly status: "OPEN" | "WON" | "LOST";
  readonly merged: boolean;
  readonly already_attempted: boolean;
  readonly pairing_state: WhatsAppPairingState | null;
  readonly attendant_phone_present: boolean;
}): FirstContactAttemptPlan {
  const eligibility = planFirstContactDispatch(input);
  if (eligibility.kind === "NONE") {
    return eligibility;
  }
  if (input.trigger !== input.occurred_trigger) {
    return { kind: "NONE", reason: "TRIGGER_MISMATCH" };
  }
  if (input.already_attempted) {
    return { kind: "NONE", reason: "ALREADY_ATTEMPTED" };
  }
  if (input.pairing_state !== "CONNECTED") {
    return { kind: "FAIL", reason: "INSTANCE_NOT_CONNECTED" };
  }
  if (input.occurred_trigger === "ON_ASSIGNMENT" && !input.attendant_phone_present) {
    return { kind: "FAIL", reason: "ATTENDANT_PHONE_MISSING" };
  }
  return { kind: "QUEUE" };
}

export type ChannelOutboundTransitionAction = "DISPATCH" | "BEGIN_SEND" | "ACCEPT" | "FAIL";

export type ChannelOutboundTransitionRefusal = "INVALID_TRANSITION" | "ALREADY_TERMINAL";

export type ChannelOutboundTransitionDecision =
  | {
      readonly allowed: true;
      readonly dispatch_status: ChannelOutboundDispatchStatus;
      readonly delivery_status: ChannelOutboundDeliveryStatus;
    }
  | { readonly allowed: false; readonly reason: ChannelOutboundTransitionRefusal };

export function decideChannelOutboundTransition(
  current: {
    readonly dispatch_status: ChannelOutboundDispatchStatus;
    readonly delivery_status: ChannelOutboundDeliveryStatus;
  },
  action: ChannelOutboundTransitionAction
): ChannelOutboundTransitionDecision {
  if (current.delivery_status === "SENT" || current.delivery_status === "FAILED") {
    return { allowed: false, reason: "ALREADY_TERMINAL" };
  }
  if (action === "DISPATCH") {
    if (current.dispatch_status === "PENDING" && current.delivery_status === "QUEUED") {
      return { allowed: true, dispatch_status: "DISPATCHED", delivery_status: "QUEUED" };
    }
    return { allowed: false, reason: "INVALID_TRANSITION" };
  }
  if (action === "BEGIN_SEND") {
    if (current.dispatch_status === "DISPATCHED" && current.delivery_status === "QUEUED") {
      return { allowed: true, dispatch_status: "DISPATCHED", delivery_status: "PROCESSING" };
    }
    return { allowed: false, reason: "INVALID_TRANSITION" };
  }
  if (current.delivery_status !== "PROCESSING") {
    return { allowed: false, reason: "INVALID_TRANSITION" };
  }
  if (action === "ACCEPT") {
    return { allowed: true, dispatch_status: "DISPATCHED", delivery_status: "SENT" };
  }
  return { allowed: true, dispatch_status: "DISPATCHED", delivery_status: "FAILED" };
}

export interface ChannelOutboundSendPayload {
  readonly instance_name: string | null;
  readonly pairing_state: WhatsAppPairingState | null;
  readonly destination_e164: string | null;
  readonly trigger: FirstContactTrigger;
  readonly template_body: string;
  readonly lead_name: string;
  readonly workspace_name: string;
  readonly attendant_name: string | null;
  readonly attendant_phone_e164: string | null;
}

export type PreparedChannelOutboundSend =
  | {
      readonly kind: "SEND";
      readonly instance_name: string;
      readonly number: string;
      readonly text: string;
    }
  | {
      readonly kind: "FAIL";
      readonly reason: Extract<
        ChannelOutboundFailureReason,
        "INSTANCE_NOT_CONNECTED" | "ATTENDANT_PHONE_MISSING" | "KNOWN_REFUSAL"
      >;
    };

/**
 * Last local checks before HTTP. The worker sends the saved template as-is;
 * automatic variation is out of scope.
 */
export function prepareChannelOutboundSend(
  payload: ChannelOutboundSendPayload
): PreparedChannelOutboundSend {
  if (payload.pairing_state !== "CONNECTED" || payload.instance_name === null) {
    return { kind: "FAIL", reason: "INSTANCE_NOT_CONNECTED" };
  }
  const number =
    payload.destination_e164 === null ? null : whatsMiauDigitsFromE164(payload.destination_e164);
  if (number === null) {
    return { kind: "FAIL", reason: "KNOWN_REFUSAL" };
  }
  if (payload.trigger === "ON_ASSIGNMENT" && payload.attendant_phone_e164 === null) {
    return { kind: "FAIL", reason: "ATTENDANT_PHONE_MISSING" };
  }
  const rendered = renderFirstContactTemplate({
    trigger: payload.trigger,
    template_body: payload.template_body,
    values: {
      lead_name: payload.lead_name,
      workspace_name: payload.workspace_name,
      attendant_name: payload.attendant_name ?? undefined,
      attendant_phone: payload.attendant_phone_e164 ?? undefined
    }
  });
  if (!rendered.ok) {
    return { kind: "FAIL", reason: "KNOWN_REFUSAL" };
  }
  return {
    kind: "SEND",
    instance_name: payload.instance_name,
    number,
    text: rendered.text
  };
}
