import { randomUUID } from "node:crypto";
import { integrationEventJobId } from "@marctco/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimPendingIntegrationEvents = vi.fn();
const markIntegrationEventDispatched = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  claimPendingIntegrationEvents,
  markIntegrationEventDispatched,
  createJobContext
}));

const { dispatchIntervalMs, dispatchPendingIntegrationEvents } = await import(
  "./ingestion-dispatcher"
);

const workspace_id = randomUUID();
const first_event_id = randomUUID();
const second_event_id = randomUUID();

describe("dispatchPendingIntegrationEvents", () => {
  beforeEach(() => {
    claimPendingIntegrationEvents
      .mockReset()
      .mockResolvedValue([{ id: first_event_id, workspace_id }]);
    markIntegrationEventDispatched.mockReset().mockResolvedValue(undefined);
    createJobContext.mockClear();
  });

  it("publishes a job carrying identifiers only, under a deterministic id", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);

    await expect(dispatchPendingIntegrationEvents({ publish })).resolves.toEqual({
      claimed: 1,
      dispatched: 1
    });
    expect(publish).toHaveBeenCalledWith(integrationEventJobId(first_event_id), {
      integration_event_id: first_event_id,
      workspace_id
    });
  });

  it("records the dispatch only after the queue accepted the job", async () => {
    const order: string[] = [];
    const publish = vi.fn().mockImplementation(() => {
      order.push("publish");
      return Promise.resolve();
    });
    markIntegrationEventDispatched.mockImplementation(() => {
      order.push("mark");
      return Promise.resolve();
    });

    await dispatchPendingIntegrationEvents({ publish });

    expect(order).toEqual(["publish", "mark"]);
  });

  it("leaves an event pending when the queue is unreachable", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(dispatchPendingIntegrationEvents({ publish })).resolves.toEqual({
      claimed: 1,
      dispatched: 0
    });
    expect(markIntegrationEventDispatched).not.toHaveBeenCalled();
  });

  it("refuses a sweep interval that would hammer the outbox, and defaults without one", () => {
    expect(dispatchIntervalMs(undefined)).toBe(2_000);
    expect(dispatchIntervalMs("5000")).toBe(5_000);
    expect(() => dispatchIntervalMs("10")).toThrow(/at least 250/);
    expect(() => dispatchIntervalMs("nem numero")).toThrow(/at least 250/);
  });

  it("keeps dispatching the rest of the batch after one failure", async () => {
    claimPendingIntegrationEvents.mockResolvedValue([
      { id: first_event_id, workspace_id },
      { id: second_event_id, workspace_id }
    ]);
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(undefined);

    await expect(dispatchPendingIntegrationEvents({ publish })).resolves.toEqual({
      claimed: 2,
      dispatched: 1
    });
    expect(createJobContext).toHaveBeenCalledWith({
      workspace_id,
      integration_event_id: second_event_id
    });
  });
});
