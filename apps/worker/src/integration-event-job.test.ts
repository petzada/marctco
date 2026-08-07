import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readIntegrationEventForProcessing = vi.fn();
const markIntegrationEventProcessed = vi.fn();
const findPersonCandidates = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  readIntegrationEventForProcessing,
  markIntegrationEventProcessed,
  findPersonCandidates,
  createJobContext
}));

const { processIntegrationEventJob } = await import("./integration-event-job.js");

const workspace_id = randomUUID();
const integration_event_id = randomUUID();
const known_person_id = randomUUID();

describe("processIntegrationEventJob", () => {
  beforeEach(() => {
    readIntegrationEventForProcessing.mockReset().mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      provider: "PLUGA",
      status: "RECEIVED",
      raw: { name: "Fulano", phone: "(11) 98765-4321" },
      received_at: new Date()
    });
    markIntegrationEventProcessed.mockReset().mockResolvedValue(undefined);
    findPersonCandidates.mockReset().mockResolvedValue([]);
    createJobContext.mockClear();
  });

  it("scopes the work by the workspace the job carries, not by the payload", async () => {
    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(createJobContext).toHaveBeenCalledWith({ workspace_id, integration_event_id });
    expect(markIntegrationEventProcessed).toHaveBeenCalledOnce();
  });

  it("fails loudly when the event is invisible in the workspace the job claims", async () => {
    readIntegrationEventForProcessing.mockRejectedValue(
      new Error("The integration event is not visible in the workspace its job claims")
    );

    await expect(
      processIntegrationEventJob({ integration_event_id, workspace_id })
    ).rejects.toThrow(/not visible/i);
    expect(markIntegrationEventProcessed).not.toHaveBeenCalled();
  });

  it("stays inert for an event already processed, so republication costs nothing", async () => {
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      provider: "PLUGA",
      status: "PROCESSED",
      raw: null,
      received_at: new Date()
    });

    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(markIntegrationEventProcessed).not.toHaveBeenCalled();
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

  it("recognises a returning Pessoa instead of creating a second one", async () => {
    findPersonCandidates.mockResolvedValue([
      { person_id: known_person_id, cpf: null, matched: { cpf: false, phone: true, email: false } }
    ]);

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.person_decision).toMatchObject({
      kind: "REUSE_PERSON",
      person_id: known_person_id
    });
  });

  it("decides a new Pessoa with a marked conflict when the keys disagree", async () => {
    const other_person_id = randomUUID();
    findPersonCandidates.mockResolvedValue([
      { person_id: known_person_id, cpf: null, matched: { cpf: false, phone: true, email: false } },
      { person_id: other_person_id, cpf: null, matched: { cpf: false, phone: false, email: true } }
    ]);

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.person_decision).toMatchObject({
      kind: "NEW_PERSON_WITH_IDENTITY_CONFLICT",
      candidate_person_ids: [known_person_id, other_person_id]
    });
  });

  it("decides no Pessoa for a submission with no phone and no e-mail", async () => {
    readIntegrationEventForProcessing.mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      provider: "PLUGA",
      status: "RECEIVED",
      raw: { name: "Fulano", campaign_id: "c1" },
      received_at: new Date()
    });

    const processed = await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(processed.person_decision).toEqual({ kind: "NO_CONTACT" });
    expect(findPersonCandidates).toHaveBeenCalledOnce();
  });

  it("refuses a job whose data is not the pair of identifiers", async () => {
    await expect(processIntegrationEventJob(null)).rejects.toThrow(/identifiers/i);
    await expect(processIntegrationEventJob({ workspace_id })).rejects.toThrow(/identifiers/i);
    expect(readIntegrationEventForProcessing).not.toHaveBeenCalled();
  });
});
