import { describe, expect, it } from "vitest";
import {
  CHANNEL_OUTBOUND_DELIVERY_STATUSES,
  CHANNEL_OUTBOUND_DISPATCH_STATUSES,
  CHANNEL_OUTBOUND_FAILURE_REASONS,
  CHANNEL_OUTBOUND_KIND,
  decideChannelOutboundTransition,
  planFirstContactAttempt,
  prepareChannelOutboundSend
} from "./channel-outbound.js";

const eligible = {
  feature_flag_enabled: true,
  trigger: "ON_ASSIGNMENT" as const,
  occurred_trigger: "ON_ASSIGNMENT" as const,
  whatsapp_opt_in: true,
  missing_phone: false,
  status: "OPEN" as const,
  merged: false,
  already_attempted: false,
  pairing_state: "CONNECTED" as const,
  attendant_phone_present: true
};

describe("channel outbound vocabulary", () => {
  it("exposes the closed machines from ADR-0005", () => {
    expect(CHANNEL_OUTBOUND_KIND).toBe("AUTO_FIRST_CONTACT");
    expect(CHANNEL_OUTBOUND_DISPATCH_STATUSES).toEqual(["PENDING", "DISPATCHED"]);
    expect(CHANNEL_OUTBOUND_DELIVERY_STATUSES).toEqual([
      "QUEUED",
      "PROCESSING",
      "SENT",
      "FAILED"
    ]);
    expect(CHANNEL_OUTBOUND_FAILURE_REASONS).toEqual([
      "INSTANCE_NOT_CONNECTED",
      "ATTENDANT_PHONE_MISSING",
      "KNOWN_REFUSAL",
      "UNCERTAIN_EXTERNAL"
    ]);
  });
});

describe("planFirstContactAttempt", () => {
  it("applies flag, trigger, opt-in and eligibility before operational preconditions", () => {
    expect(planFirstContactAttempt({ ...eligible, feature_flag_enabled: false })).toEqual({
      kind: "NONE",
      reason: "FLAG_OFF"
    });
    expect(planFirstContactAttempt({ ...eligible, trigger: "DISABLED" })).toEqual({
      kind: "NONE",
      reason: "TRIGGER_DISABLED"
    });
    expect(planFirstContactAttempt({ ...eligible, whatsapp_opt_in: null })).toEqual({
      kind: "NONE",
      reason: "NO_OPT_IN"
    });
    expect(planFirstContactAttempt({ ...eligible, missing_phone: true })).toEqual({
      kind: "NONE",
      reason: "MISSING_PHONE"
    });
    expect(planFirstContactAttempt({ ...eligible, status: "WON" })).toEqual({
      kind: "NONE",
      reason: "NOT_OPEN"
    });
    expect(planFirstContactAttempt({ ...eligible, merged: true })).toEqual({
      kind: "NONE",
      reason: "MERGED"
    });
  });

  it("creates no intention when the occurred trigger does not match the configured one", () => {
    expect(
      planFirstContactAttempt({
        ...eligible,
        trigger: "ON_ARRIVAL",
        occurred_trigger: "ON_ASSIGNMENT"
      })
    ).toEqual({ kind: "NONE", reason: "TRIGGER_MISMATCH" });
    expect(
      planFirstContactAttempt({
        ...eligible,
        trigger: "ON_ASSIGNMENT",
        occurred_trigger: "ON_ARRIVAL",
        attendant_phone_present: false
      })
    ).toEqual({ kind: "NONE", reason: "TRIGGER_MISMATCH" });
  });

  it("creates no second intention when any attempt already exists", () => {
    expect(planFirstContactAttempt({ ...eligible, already_attempted: true })).toEqual({
      kind: "NONE",
      reason: "ALREADY_ATTEMPTED"
    });
    expect(
      planFirstContactAttempt({
        ...eligible,
        already_attempted: true,
        pairing_state: "DISCONNECTED"
      })
    ).toEqual({ kind: "NONE", reason: "ALREADY_ATTEMPTED" });
  });

  it("records a terminal FAILED attempt when the instance is not connected", () => {
    expect(planFirstContactAttempt({ ...eligible, pairing_state: null })).toEqual({
      kind: "FAIL",
      reason: "INSTANCE_NOT_CONNECTED"
    });
    expect(planFirstContactAttempt({ ...eligible, pairing_state: "DISCONNECTED" })).toEqual({
      kind: "FAIL",
      reason: "INSTANCE_NOT_CONNECTED"
    });
    expect(planFirstContactAttempt({ ...eligible, pairing_state: "QR_PENDING" })).toEqual({
      kind: "FAIL",
      reason: "INSTANCE_NOT_CONNECTED"
    });
    expect(planFirstContactAttempt({ ...eligible, pairing_state: "ERROR" })).toEqual({
      kind: "FAIL",
      reason: "INSTANCE_NOT_CONNECTED"
    });
  });

  it("records a terminal FAILED attempt when assignment has no attendant phone", () => {
    expect(planFirstContactAttempt({ ...eligible, attendant_phone_present: false })).toEqual({
      kind: "FAIL",
      reason: "ATTENDANT_PHONE_MISSING"
    });
  });

  it("does not require an attendant phone on ON_ARRIVAL", () => {
    expect(
      planFirstContactAttempt({
        ...eligible,
        trigger: "ON_ARRIVAL",
        occurred_trigger: "ON_ARRIVAL",
        attendant_phone_present: false
      })
    ).toEqual({ kind: "QUEUE" });
  });

  it("queues one automatic attempt when every guard and precondition passes", () => {
    expect(planFirstContactAttempt(eligible)).toEqual({ kind: "QUEUE" });
  });
});

describe("decideChannelOutboundTransition", () => {
  it("allows publication of a queued pending attempt", () => {
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "PENDING", delivery_status: "QUEUED" },
        "DISPATCH"
      )
    ).toEqual({ allowed: true, dispatch_status: "DISPATCHED", delivery_status: "QUEUED" });
  });

  it("allows PROCESSING only after publication", () => {
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "QUEUED" },
        "BEGIN_SEND"
      )
    ).toEqual({
      allowed: true,
      dispatch_status: "DISPATCHED",
      delivery_status: "PROCESSING"
    });
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "PENDING", delivery_status: "QUEUED" },
        "BEGIN_SEND"
      )
    ).toEqual({ allowed: false, reason: "INVALID_TRANSITION" });
  });

  it("accepts SENT and FAILED only from PROCESSING", () => {
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "PROCESSING" },
        "ACCEPT"
      )
    ).toEqual({ allowed: true, dispatch_status: "DISPATCHED", delivery_status: "SENT" });
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "PROCESSING" },
        "FAIL"
      )
    ).toEqual({ allowed: true, dispatch_status: "DISPATCHED", delivery_status: "FAILED" });
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "QUEUED" },
        "ACCEPT"
      )
    ).toEqual({ allowed: false, reason: "INVALID_TRANSITION" });
  });

  it("treats SENT and FAILED as terminal, including a second ACCEPT", () => {
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "SENT" },
        "ACCEPT"
      )
    ).toEqual({ allowed: false, reason: "ALREADY_TERMINAL" });
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "FAILED" },
        "BEGIN_SEND"
      )
    ).toEqual({ allowed: false, reason: "ALREADY_TERMINAL" });
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "PROCESSING" },
        "DISPATCH"
      )
    ).toEqual({ allowed: false, reason: "INVALID_TRANSITION" });
  });

  it("never returns a queued attempt to the publication lane after PROCESSING", () => {
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "PROCESSING" },
        "DISPATCH"
      )
    ).toEqual({ allowed: false, reason: "INVALID_TRANSITION" });
    expect(
      decideChannelOutboundTransition(
        { dispatch_status: "DISPATCHED", delivery_status: "FAILED" },
        "DISPATCH"
      )
    ).toEqual({ allowed: false, reason: "ALREADY_TERMINAL" });
  });
});

const sendable = {
  instance_name: "marctco_11111111111141118111111111111111",
  pairing_state: "CONNECTED" as const,
  destination_e164: "+5511987654321",
  trigger: "ON_ASSIGNMENT" as const,
  template_body:
    "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}.",
  lead_name: "Maria",
  workspace_name: "Assessoria Horizonte",
  attendant_name: "Ana",
  attendant_phone_e164: "+5511912345678"
};

describe("prepareChannelOutboundSend", () => {
  it("renders the saved template exactly and converts the destination to digits", () => {
    expect(prepareChannelOutboundSend(sendable)).toEqual({
      kind: "SEND",
      instance_name: sendable.instance_name,
      number: "5511987654321",
      text: "Olá Maria, sou Ana da Assessoria Horizonte. Meu WhatsApp é +5511912345678."
    });
  });

  it("fails closed when the instance is missing or not connected", () => {
    expect(prepareChannelOutboundSend({ ...sendable, pairing_state: "DISCONNECTED" })).toEqual({
      kind: "FAIL",
      reason: "INSTANCE_NOT_CONNECTED"
    });
    expect(prepareChannelOutboundSend({ ...sendable, instance_name: null })).toEqual({
      kind: "FAIL",
      reason: "INSTANCE_NOT_CONNECTED"
    });
  });

  it("fails closed when the lead phone or assignment phone is missing", () => {
    expect(prepareChannelOutboundSend({ ...sendable, destination_e164: null })).toEqual({
      kind: "FAIL",
      reason: "KNOWN_REFUSAL"
    });
    expect(prepareChannelOutboundSend({ ...sendable, attendant_phone_e164: null })).toEqual({
      kind: "FAIL",
      reason: "ATTENDANT_PHONE_MISSING"
    });
  });
});
