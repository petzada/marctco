import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readIntegrationEventForProcessing = vi.fn();
const findPersonCandidates = vi.fn();
const resolveIntakeDestination = vi.fn();
const recordLeadSubmission = vi.fn();
const findOpenOpportunitiesOfPerson = vi.fn();
const applyIntakePlan = vi.fn();
const readWorkspaceFeatureFlags = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  readIntegrationEventForProcessing,
  findPersonCandidates,
  resolveIntakeDestination,
  recordLeadSubmission,
  findOpenOpportunitiesOfPerson,
  applyIntakePlan,
  readWorkspaceFeatureFlags,
  createJobContext
}));

const { processIntegrationEventJob } = await import("./integration-event-job.js");

const workspace_id = randomUUID();
const integration_event_id = randomUUID();
const lead_submission_id = randomUUID();
const known_person_id = randomUUID();
const pipeline_id = randomUUID();
const entry_stage_id = randomUUID();
const opportunity_id = randomUUID();
const RECEIVED_AT = new Date("2026-08-08T12:00:00.000Z");

/** The single plan `applyIntakePlan` was handed, narrowed for assertions. */
function appliedPlan(): Record<string, unknown> {
  const call = applyIntakePlan.mock.calls[0] as [unknown, Record<string, unknown>];
  return call[1];
}

describe("processIntegrationEventJob", () => {
  beforeEach(() => {
    readIntegrationEventForProcessing.mockReset().mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      provider: "PLUGA",
      target_pipeline_id: null,
      status: "RECEIVED",
      raw: { name: "Fulano", phone: "(11) 98765-4321" },
      received_at: RECEIVED_AT
    });
    findPersonCandidates.mockReset().mockResolvedValue([]);
    resolveIntakeDestination
      .mockReset()
      .mockResolvedValue({ pipeline_id, entry_stage_id });
    recordLeadSubmission
      .mockReset()
      .mockResolvedValue({ kind: "INSERTED", lead_submission_id });
    findOpenOpportunitiesOfPerson.mockReset().mockResolvedValue([]);
    applyIntakePlan
      .mockReset()
      .mockResolvedValue({ kind: "NEW_OPPORTUNITY", opportunity_id, person_id: randomUUID() });
    readWorkspaceFeatureFlags.mockReset().mockResolvedValue({
      auto_primeiro_contato: false,
      score_cabimento_llm: false,
      resumo_handoff_llm: false
    });
    createJobContext.mockClear();
  });

  it("scopes the work by the workspace the job carries, not by the payload", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(createJobContext).toHaveBeenCalledWith({ workspace_id, integration_event_id });
    expect(applyIntakePlan).toHaveBeenCalledOnce();
  });

  it("fails loudly when the event is invisible in the workspace the job claims", async () => {
    readIntegrationEventForProcessing.mockRejectedValue(
      new Error("The integration event is not visible in the workspace its job claims")
    );

    await expect(
      processIntegrationEventJob({ integration_event_id, workspace_id })
    ).rejects.toThrow(/not visible/i);
    expect(applyIntakePlan).not.toHaveBeenCalled();
  });

  it("stays inert for an event already processed, so republication costs nothing", async () => {
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      provider: "PLUGA",
      target_pipeline_id: null,
      status: "PROCESSED",
      raw: null,
      received_at: RECEIVED_AT
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.intake_plan_kind).toBeNull();
    expect(recordLeadSubmission).not.toHaveBeenCalled();
    expect(applyIntakePlan).not.toHaveBeenCalled();
  });

  it("looks the Pessoa up by the normalized keys the domain planned, under the job's tenant", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(findPersonCandidates).toHaveBeenCalledOnce();
    const [context, plan] = findPersonCandidates.mock.calls[0] as [
      { workspace_id: string },
      { keys: Array<{ kind: string; value: string; strength: string }> }
    ];
    expect(context.workspace_id).toBe(workspace_id);
    expect(plan.keys).toEqual([
      { kind: "PHONE", value: "+5511987654321", strength: "MODERATE" }
    ]);
  });

  it("records the submission under the key the domain planned, before deciding anything", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    const [, input] = recordLeadSubmission.mock.calls[0] as [
      unknown,
      { key: { source: string; external_lead_id: string }; received_at: Date }
    ];
    // Pluga carries no id of its own in this slice, so the connector uses the
    // event id: identical on every reprocessing, which is what stops a
    // republished event from becoming a second lead.
    expect(input.key).toEqual({
      source: "META_LEAD_ADS",
      external_lead_id: integration_event_id
    });
    expect(input.received_at).toEqual(RECEIVED_AT);
  });

  it("plans a card in the ENTRY stage, with arrived_at equal to the received instant", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(appliedPlan()).toMatchObject({
      kind: "NEW_OPPORTUNITY",
      lead_submission_id,
      pipeline_id,
      stage_id: entry_stage_id,
      arrived_at: RECEIVED_AT,
      missing_phone: false
    });
  });

  it("keeps the post-creation hook inert while auto first contact is disabled", async () => {
    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(readWorkspaceFeatureFlags).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id })
    );
    expect(processed.post_creation_effects).toEqual([]);
  });

  it("emits one server-side effect only after a new Opportunity was actually created", async () => {
    readWorkspaceFeatureFlags.mockResolvedValue({
      auto_primeiro_contato: true,
      score_cabimento_llm: false,
      resumo_handoff_llm: false
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.post_creation_effects).toEqual([
      { kind: "AUTO_FIRST_CONTACT", opportunity_id }
    ]);
  });

  it("does not emit an effect when a concurrent worker reused the existing Opportunity", async () => {
    readWorkspaceFeatureFlags.mockResolvedValue({
      auto_primeiro_contato: true,
      score_cabimento_llm: false,
      resumo_handoff_llm: false
    });
    applyIntakePlan.mockResolvedValue({ kind: "RETRANSMISSION", opportunity_id });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.post_creation_effects).toEqual([]);
    expect(readWorkspaceFeatureFlags).not.toHaveBeenCalled();
  });

  it("routes by the connection's target pipeline when it declares one", async () => {
    const targeted = randomUUID();
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      provider: "PLUGA",
      target_pipeline_id: targeted,
      status: "RECEIVED",
      raw: { name: "Fulano", phone: "(11) 98765-4321" },
      received_at: RECEIVED_AT
    });

    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(resolveIntakeDestination).toHaveBeenCalledWith(expect.anything(), targeted);
  });

  it("recognises a returning Pessoa instead of creating a second one", async () => {
    findPersonCandidates.mockResolvedValue([
      { person_id: known_person_id, cpf: null, matched: { cpf: false, phone: true, email: false } }
    ]);

    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(appliedPlan()).toMatchObject({ person: { kind: "REUSE", person_id: known_person_id } });
    // Only a Pessoa that already exists can already have a card.
    expect(findOpenOpportunitiesOfPerson).toHaveBeenCalledWith(expect.anything(), known_person_id);
  });

  it("links the new card to the open one the same Pessoa already had", async () => {
    findPersonCandidates.mockResolvedValue([
      { person_id: known_person_id, cpf: null, matched: { cpf: false, phone: true, email: false } }
    ]);
    findOpenOpportunitiesOfPerson.mockResolvedValue([opportunity_id]);

    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(appliedPlan().reviews).toEqual([
      { type: "POSSIBLE_DUPLICATE", related_opportunity_id: opportunity_id }
    ]);
  });

  it("creates the card and marks the conflict when the keys disagree", async () => {
    const other_person_id = randomUUID();
    findPersonCandidates.mockResolvedValue([
      { person_id: known_person_id, cpf: null, matched: { cpf: false, phone: true, email: false } },
      { person_id: other_person_id, cpf: null, matched: { cpf: false, phone: false, email: true } }
    ]);

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.intake_plan_kind).toBe("NEW_OPPORTUNITY");
    expect(appliedPlan()).toMatchObject({
      person: { kind: "CREATE" },
      reviews: [
        { type: "IDENTITY_CONFLICT", candidate_person_ids: [known_person_id, other_person_id] }
      ]
    });
    // The new Pessoa does not exist yet, so there is no card to read.
    expect(findOpenOpportunitiesOfPerson).toHaveBeenCalledWith(expect.anything(), null);
  });

  it("quarantines a submission with no phone and no e-mail", async () => {
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      provider: "PLUGA",
      target_pipeline_id: null,
      status: "RECEIVED",
      raw: { name: "Fulano", campaign_id: "c1" },
      received_at: RECEIVED_AT
    });
    applyIntakePlan.mockResolvedValue({ kind: "QUARANTINE" });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.intake_plan_kind).toBe("QUARANTINE");
    expect(appliedPlan()).toEqual({
      kind: "QUARANTINE",
      lead_submission_id,
      integration_event_id
    });
  });

  it("stays inert on a retransmission of a submission that already has a card", async () => {
    recordLeadSubmission.mockResolvedValue({
      kind: "DUPLICATE",
      lead_submission_id,
      opportunity_id
    });
    applyIntakePlan.mockResolvedValue({ kind: "RETRANSMISSION", opportunity_id });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.intake_plan_kind).toBe("RETRANSMISSION");
    expect(appliedPlan()).toEqual({
      kind: "RETRANSMISSION",
      lead_submission_id,
      opportunity_id,
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
