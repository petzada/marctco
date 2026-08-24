import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readIntegrationEventForProcessing = vi.fn();
const resolveIntakeDestination = vi.fn();
const recordLeadSubmission = vi.fn();
const decideAndApplyIntake = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  readIntegrationEventForProcessing,
  resolveIntakeDestination,
  recordLeadSubmission,
  decideAndApplyIntake,
  createJobContext
}));

const { processIntegrationEventJob } = await import("./integration-event-job.js");

const workspace_id = randomUUID();
const integration_event_id = randomUUID();
const integration_connection_id = randomUUID();
const lead_submission_id = randomUUID();
const pipeline_id = randomUUID();
const entry_stage_id = randomUUID();
const opportunity_id = randomUUID();
const RECEIVED_AT = new Date("2026-08-08T12:00:00.000Z");

/** The single transactional decision input the coordinator received. */
function coordinatedInput(): Record<string, unknown> {
  const call = decideAndApplyIntake.mock.calls[0] as [unknown, Record<string, unknown>];
  return call[1];
}

describe("processIntegrationEventJob", () => {
  beforeEach(() => {
    readIntegrationEventForProcessing.mockReset().mockResolvedValue({
      id: integration_event_id,
      integration_connection_id,
      provider: "PLUGA",
      target_pipeline_id: null,
      status: "RECEIVED",
      raw: { name: "Fulano", phone: "(11) 98765-4321" },
      received_at: RECEIVED_AT
    });
    resolveIntakeDestination
      .mockReset()
      .mockResolvedValue({ pipeline_id, entry_stage_id });
    recordLeadSubmission
      .mockReset()
      .mockResolvedValue({ kind: "INSERTED", lead_submission_id });
    decideAndApplyIntake
      .mockReset()
      .mockResolvedValue({
        intake_plan_kind: "NEW_OPPORTUNITY",
        applied: { kind: "NEW_OPPORTUNITY", opportunity_id, person_id: randomUUID() },
        post_creation_effects: []
      });
    createJobContext.mockClear();
  });

  it("scopes the work by the workspace the job carries, not by the payload", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(createJobContext).toHaveBeenCalledWith({ workspace_id, integration_event_id });
    expect(decideAndApplyIntake).toHaveBeenCalledOnce();
  });

  it("fails loudly when the event is invisible in the workspace the job claims", async () => {
    readIntegrationEventForProcessing.mockRejectedValue(
      new Error("The integration event is not visible in the workspace its job claims")
    );

    await expect(
      processIntegrationEventJob({ integration_event_id, workspace_id })
    ).rejects.toThrow(/not visible/i);
    expect(decideAndApplyIntake).not.toHaveBeenCalled();
  });

  it("stays inert for an event already processed, so republication costs nothing", async () => {
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id,
      provider: "PLUGA",
      target_pipeline_id: null,
      status: "PROCESSED",
      raw: null,
      received_at: RECEIVED_AT
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.intake_plan_kind).toBeNull();
    expect(recordLeadSubmission).not.toHaveBeenCalled();
    expect(decideAndApplyIntake).not.toHaveBeenCalled();
  });

  it("hands the normalized lead to the transactional coordinator under the job's tenant", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(decideAndApplyIntake).toHaveBeenCalledOnce();
    const [context, input] = decideAndApplyIntake.mock.calls[0] as [
      { workspace_id: string },
      { normalized: { phones: string[] } }
    ];
    expect(context.workspace_id).toBe(workspace_id);
    expect(input.normalized.phones).toEqual(["+5511987654321"]);
  });

  it("records the submission under the key the domain planned, before deciding anything", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    const [, input] = recordLeadSubmission.mock.calls[0] as [
      unknown,
      {
        key: { integration_connection_id: string; source: string; external_lead_id: string };
        received_at: Date;
        whatsapp_opt_in: boolean | null;
      }
    ];
    // Pluga carries no id of its own in this slice, so the connector uses the
    // event id: identical on every reprocessing, which is what stops a
    // republished event from becoming a second lead. The connection rides in
    // the key so two origins numbering independently cannot swallow each
    // other (ADR-0031); the job takes it from the event it already read, and
    // never from the payload.
    expect(input.key).toEqual({
      integration_connection_id,
      source: "META_LEAD_ADS",
      external_lead_id: integration_event_id
    });
    expect(input.received_at).toEqual(RECEIVED_AT);
    expect(input.whatsapp_opt_in).toBeNull();
  });

  it("coordinates the decision in the ENTRY stage, with now equal to the received instant", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(coordinatedInput()).toMatchObject({
      submission: { kind: "INSERTED", lead_submission_id },
      destination: { pipeline_id, entry_stage_id },
      integration_event_id,
      now: RECEIVED_AT
    });
  });

  it("forwards arrival-channel effects recorded in the coordinator and does not remount flags", async () => {
    decideAndApplyIntake.mockResolvedValue({
      intake_plan_kind: "NEW_OPPORTUNITY",
      applied: { kind: "NEW_OPPORTUNITY", opportunity_id, person_id: randomUUID() },
      post_creation_effects: [{ kind: "AUTO_FIRST_CONTACT", opportunity_id }]
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.post_creation_effects).toEqual([
      { kind: "AUTO_FIRST_CONTACT", opportunity_id }
    ]);
  });

  it("keeps the arrival hook empty when the coordinator recorded nothing", async () => {
    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });
    expect(processed.post_creation_effects).toEqual([]);
  });

  it("does not emit an effect when a concurrent worker reused the existing Opportunity", async () => {
    decideAndApplyIntake.mockResolvedValue({
      intake_plan_kind: "RETRANSMISSION",
      applied: { kind: "RETRANSMISSION", opportunity_id },
      post_creation_effects: []
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.post_creation_effects).toEqual([]);
  });

  it("routes by the connection's target pipeline when it declares one", async () => {
    const targeted = randomUUID();
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id,
      provider: "PLUGA",
      target_pipeline_id: targeted,
      status: "RECEIVED",
      raw: { name: "Fulano", phone: "(11) 98765-4321" },
      received_at: RECEIVED_AT
    });

    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(resolveIntakeDestination).toHaveBeenCalledWith(expect.anything(), targeted);
  });

  it("quarantines a submission with no phone and no e-mail", async () => {
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id,
      provider: "PLUGA",
      target_pipeline_id: null,
      status: "RECEIVED",
      raw: { name: "Fulano", campaign_id: "c1" },
      received_at: RECEIVED_AT
    });
    decideAndApplyIntake.mockResolvedValue({
      intake_plan_kind: "QUARANTINE",
      applied: { kind: "QUARANTINE" },
      post_creation_effects: []
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.intake_plan_kind).toBe("QUARANTINE");
    expect(coordinatedInput()).toMatchObject({
      submission: { kind: "INSERTED", lead_submission_id },
      integration_event_id
    });
  });

  it("stays inert on a retransmission of a submission that already has a card", async () => {
    recordLeadSubmission.mockResolvedValue({
      kind: "DUPLICATE",
      lead_submission_id,
      opportunity_id
    });
    decideAndApplyIntake.mockResolvedValue({
      intake_plan_kind: "RETRANSMISSION",
      applied: { kind: "RETRANSMISSION", opportunity_id },
      post_creation_effects: []
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.intake_plan_kind).toBe("RETRANSMISSION");
    expect(coordinatedInput()).toMatchObject({
      submission: { kind: "DUPLICATE", lead_submission_id, opportunity_id },
      integration_event_id
    });
  });

  it("returns no personal data at all — BullMQ keeps the return value in Redis", async () => {
    // A processor's resolved value is stored as the job's `returnvalue`, which
    // is outside Postgres, outside RLS and outside the 90-day expiry. A plan
    // carries the submission's name, phones, e-mails and CPF; returning one
    // would be a second copy of the payload (ADR-0014).
    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(Object.keys(processed).sort()).toEqual([
      "intake_plan_kind",
      "integration_event_id",
      "post_creation_effects",
      "workspace_id"
    ]);
    const serialized = JSON.stringify(processed);
    expect(serialized).not.toContain("Fulano");
    expect(serialized).not.toContain("98765");
    expect(serialized).not.toContain("+5511987654321");
  });

  it("refuses a job whose data is not the pair of identifiers", async () => {
    await expect(processIntegrationEventJob(null)).rejects.toThrow(/identifiers/i);
    await expect(processIntegrationEventJob({ workspace_id })).rejects.toThrow(/identifiers/i);
    expect(readIntegrationEventForProcessing).not.toHaveBeenCalled();
  });
});
