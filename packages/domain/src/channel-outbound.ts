/**
 * Planning and the closed state machine for one automatic WhatsApp outbound
 * attempt. Recording the outbox is a named operation; this module only
 * decides whether an intention is born, queued, or terminal, and which
 * transitions remain legal after that (ADR-0003, ADR-0007).
 */

import {
  planFirstContactDispatch,
  type FirstContactDispatchRefusal,
  type FirstContactTrigger
} from "./first-contact.js";
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
