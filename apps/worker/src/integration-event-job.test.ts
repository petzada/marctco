import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const readIntegrationEventForProcessing = vi.fn();
const markIntegrationEventProcessed = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  readIntegrationEventForProcessing,
  markIntegrationEventProcessed,
  createJobContext
}));

const { processIntegrationEventJob } = await import("./integration-event-job.js");

const workspace_id = randomUUID();
const integration_event_id = randomUUID();

describe("processIntegrationEventJob", () => {
  beforeEach(() => {
    readIntegrationEventForProcessing.mockReset().mockResolvedValue({
      id: integration_event_id,
      integration_connection_id: randomUUID(),
      status: "RECEIVED",
      raw: { nome: "Fulano" },
      received_at: new Date()
    });
    markIntegrationEventProcessed.mockReset().mockResolvedValue(undefined);
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
      status: "PROCESSED",
      raw: null,
      received_at: new Date()
    });

    await processIntegrationEventJob({ integration_event_id, workspace_id });

    expect(markIntegrationEventProcessed).not.toHaveBeenCalled();
  });

  it("refuses a job whose data is not the pair of identifiers", async () => {
    await expect(processIntegrationEventJob(null)).rejects.toThrow(/identifiers/i);
    await expect(processIntegrationEventJob({ workspace_id })).rejects.toThrow(/identifiers/i);
    expect(readIntegrationEventForProcessing).not.toHaveBeenCalled();
  });
});
