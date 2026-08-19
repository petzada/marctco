import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserContext } from "@marctco/db";

/**
 * Proves the adapter sequences the same named operations as the worker
 * (ADR-0017) — `getQuarantinedEvent` → `recordLeadSubmission` →
 * `resolveIntakeDestination` → `decideAndApplyIntake` — by mocking only the
 * I/O boundary (`@marctco/db`). Lookup, identity and the plan stay inside
 * the coordinator; this test does not reach past that seam. `now` is the
 * release instant, not `received_at`.
 */

const mocks = vi.hoisted(() => ({
  getQuarantinedEvent: vi.fn(),
  recordLeadSubmission: vi.fn(),
  resolveIntakeDestination: vi.fn(),
  decideAndApplyIntake: vi.fn()
}));

vi.mock("@marctco/db", () => ({
  getQuarantinedEvent: mocks.getQuarantinedEvent,
  recordLeadSubmission: mocks.recordLeadSubmission,
  resolveIntakeDestination: mocks.resolveIntakeDestination,
  decideAndApplyIntake: mocks.decideAndApplyIntake
}));

const { releaseQuarantinedLead } = await import("./release-quarantined-lead");

const context = {
  kind: "user",
  workspace_id: "workspace-1",
  user_id: "user-1",
  role: "MANAGER"
} as unknown as UserContext;
const RECEIVED_AT = new Date("2026-08-08T12:00:00.000Z");
const RELEASED_AT = new Date("2026-08-11T09:30:00.000Z");
const destination = { pipeline_id: "pipeline-1", entry_stage_id: "stage-1" };
const submission = {
  kind: "DUPLICATE" as const,
  lead_submission_id: "sub-1",
  opportunity_id: null
};

function coordinatedInput(): Record<string, unknown> {
  const call = mocks.decideAndApplyIntake.mock.calls[0] as [unknown, Record<string, unknown>];
  return call[1];
}

describe("releaseQuarantinedLead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getQuarantinedEvent.mockResolvedValue({
      integration_event_id: "event-1",
      lead_submission_id: "sub-1",
      received_at: RECEIVED_AT,
      raw: { ad_id: "123", campaign_id: "456" },
      provider: "PLUGA",
      target_pipeline_id: null,
      source: "META_LEAD_ADS",
      external_lead_id: "lead-1"
    });
    mocks.recordLeadSubmission.mockResolvedValue(submission);
    mocks.resolveIntakeDestination.mockResolvedValue(destination);
    mocks.decideAndApplyIntake.mockResolvedValue({
      intake_plan_kind: "NEW_OPPORTUNITY",
      applied: { kind: "NEW_OPPORTUNITY", opportunity_id: "opp-1", person_id: "person-1" }
    });
  });

  it("reads the quarantined event first, by the id the route handler received", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "", cpf: "" }
      },
      RELEASED_AT
    );

    expect(mocks.getQuarantinedEvent).toHaveBeenCalledWith(context, "event-1");
  });

  it("records the submission with the original event id and received_at — no second IntegrationEvent", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "", cpf: "" }
      },
      RELEASED_AT
    );

    expect(mocks.recordLeadSubmission).toHaveBeenCalledWith(context, {
      key: { source: "META_LEAD_ADS", external_lead_id: "lead-1" },
      integration_event_id: "event-1",
      received_at: RECEIVED_AT,
      whatsapp_opt_in: null
    });
  });

  it("resolves the destination from the connection's target_pipeline_id before coordinating", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "", cpf: "" }
      },
      RELEASED_AT
    );

    expect(mocks.resolveIntakeDestination).toHaveBeenCalledWith(context, null);
    expect(mocks.decideAndApplyIntake).toHaveBeenCalledOnce();
  });

  it("coordinates the decision with now = the release instant, not received_at", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "", cpf: "" }
      },
      RELEASED_AT
    );

    expect(coordinatedInput()).toMatchObject({
      submission,
      destination,
      integration_event_id: "event-1",
      now: RELEASED_AT
    });
  });

  it("hands the manager's completion to the coordinator as a normalized lead", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "maria@exemplo.com", cpf: "" }
      },
      RELEASED_AT
    );

    const input = coordinatedInput() as { normalized: { phones: string[]; emails: string[] } };
    expect(input.normalized.phones).toEqual(["+5511987654321"]);
    expect(input.normalized.emails).toEqual(["maria@exemplo.com"]);
  });

  it("returns exactly what decideAndApplyIntake applied", async () => {
    const result = await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "", cpf: "" }
      },
      RELEASED_AT
    );

    expect(result).toEqual({ kind: "NEW_OPPORTUNITY", opportunity_id: "opp-1", person_id: "person-1" });
  });

  it("stays QUARANTINE when the manager left both phone and e-mail empty", async () => {
    mocks.decideAndApplyIntake.mockResolvedValue({
      intake_plan_kind: "QUARANTINE",
      applied: { kind: "QUARANTINE" }
    });

    const result = await releaseQuarantinedLead(
      context,
      { integration_event_id: "event-1", completion: { name: "Maria", phone: "", email: "", cpf: "" } },
      RELEASED_AT
    );

    expect(mocks.decideAndApplyIntake).toHaveBeenCalledOnce();
    expect(coordinatedInput()).toMatchObject({ now: RELEASED_AT });
    expect(result).toEqual({ kind: "QUARANTINE" });
  });
});
