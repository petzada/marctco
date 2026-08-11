import { beforeEach, describe, expect, it, vi } from "vitest";
import type { UserContext } from "@marctco/db";

/**
 * Proves the exact call sequence ADR-0017 requires — `getQuarantinedEvent` →
 * `recordLeadSubmission` → `findPersonCandidates`/`decidePersonIdentity` →
 * `resolveIntakeDestination` + `findOpenOpportunitiesOfPerson` →
 * `decideIntake` → `applyIntakePlan` — by mocking only the I/O boundary
 * (`@marctco/db`) and letting the real `@marctco/domain` functions run, so
 * this is a test of composition, not of a hand-written stand-in for
 * `decideIntake`.
 */

const mocks = vi.hoisted(() => ({
  getQuarantinedEvent: vi.fn(),
  recordLeadSubmission: vi.fn(),
  findPersonCandidates: vi.fn(),
  resolveIntakeDestination: vi.fn(),
  findOpenOpportunitiesOfPerson: vi.fn(),
  applyIntakePlan: vi.fn()
}));

vi.mock("@marctco/db", () => ({
  getQuarantinedEvent: mocks.getQuarantinedEvent,
  recordLeadSubmission: mocks.recordLeadSubmission,
  findPersonCandidates: mocks.findPersonCandidates,
  resolveIntakeDestination: mocks.resolveIntakeDestination,
  findOpenOpportunitiesOfPerson: mocks.findOpenOpportunitiesOfPerson,
  applyIntakePlan: mocks.applyIntakePlan
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
    mocks.recordLeadSubmission.mockResolvedValue({
      kind: "DUPLICATE",
      lead_submission_id: "sub-1",
      opportunity_id: null
    });
    mocks.findPersonCandidates.mockResolvedValue([]);
    mocks.resolveIntakeDestination.mockResolvedValue({
      pipeline_id: "pipeline-1",
      entry_stage_id: "stage-1"
    });
    mocks.findOpenOpportunitiesOfPerson.mockResolvedValue([]);
    mocks.applyIntakePlan.mockResolvedValue({
      kind: "NEW_OPPORTUNITY",
      opportunity_id: "opp-1",
      person_id: "person-1"
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
      received_at: RECEIVED_AT
    });
  });

  it("looks up person candidates by the plan derived from the manager's completion", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "maria@exemplo.com", cpf: "" }
      },
      RELEASED_AT
    );

    const [calledContext, lookupPlan] = mocks.findPersonCandidates.mock.calls[0] as [
      unknown,
      { keys: ReadonlyArray<{ kind: string; value: string }> }
    ];
    expect(calledContext).toBe(context);
    expect(lookupPlan.keys).toEqual(
      expect.arrayContaining([
        { kind: "PHONE", value: "+5511987654321", strength: "MODERATE" },
        { kind: "EMAIL", value: "maria@exemplo.com", strength: "WEAK" }
      ])
    );
  });

  it("resolves the destination from the connection's target_pipeline_id, and looks up the person's open cards", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "", cpf: "" }
      },
      RELEASED_AT
    );

    expect(mocks.resolveIntakeDestination).toHaveBeenCalledWith(context, null);
    // No candidates matched, so decidePersonIdentity produced NEW_PERSON —
    // reusedPersonId is null, and a Pessoa that does not exist yet has no cards.
    expect(mocks.findOpenOpportunitiesOfPerson).toHaveBeenCalledWith(context, null);
  });

  it("decides with now = the release instant, not received_at, and applies exactly that plan", async () => {
    await releaseQuarantinedLead(
      context,
      {
        integration_event_id: "event-1",
        completion: { name: "Maria", phone: "11987654321", email: "", cpf: "" }
      },
      RELEASED_AT
    );

    expect(mocks.applyIntakePlan).toHaveBeenCalledWith(
      context,
      expect.objectContaining({
        kind: "NEW_OPPORTUNITY",
        integration_event_id: "event-1",
        arrived_at: RELEASED_AT,
        missing_phone: false
      })
    );
  });

  it("returns exactly what applyIntakePlan reports", async () => {
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
    mocks.applyIntakePlan.mockResolvedValue({ kind: "QUARANTINE" });

    const result = await releaseQuarantinedLead(
      context,
      { integration_event_id: "event-1", completion: { name: "Maria", phone: "", email: "", cpf: "" } },
      RELEASED_AT
    );

    expect(mocks.applyIntakePlan).toHaveBeenCalledWith(
      context,
      expect.objectContaining({ kind: "QUARANTINE" })
    );
    expect(result).toEqual({ kind: "QUARANTINE" });
  });
});
