import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimWorkspacesWithExpiringPayloads = vi.fn();
const expireIntegrationEventPayloads = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  claimWorkspacesWithExpiringPayloads,
  expireIntegrationEventPayloads,
  createJobContext
}));

const {
  EXPIRY_BATCH_SIZE,
  MAX_EXPIRY_BATCHES_PER_WORKSPACE,
  payloadExpiryIntervalMs,
  sweepExpiredPayloads
} = await import("./payload-expiry-sweep");

const first_workspace = randomUUID();
const second_workspace = randomUUID();
const first_anchor = randomUUID();
const second_anchor = randomUUID();
const NOW = new Date("2026-08-11T12:00:00.000Z");

describe("sweepExpiredPayloads", () => {
  beforeEach(() => {
    claimWorkspacesWithExpiringPayloads.mockReset().mockResolvedValue([
      { workspace_id: first_workspace, anchor_integration_event_id: first_anchor }
    ]);
    expireIntegrationEventPayloads.mockReset().mockResolvedValue(0);
    createJobContext.mockClear();
  });

  it("scopes every batch to the tenant discovery returned, anchored on a real event", async () => {
    await sweepExpiredPayloads(NOW);

    expect(createJobContext).toHaveBeenCalledWith({
      workspace_id: first_workspace,
      integration_event_id: first_anchor
    });
    expect(expireIntegrationEventPayloads).toHaveBeenCalledWith(
      { workspace_id: first_workspace, integration_event_id: first_anchor },
      { now: NOW, batch_size: EXPIRY_BATCH_SIZE }
    );
  });

  it("keeps asking for batches while a batch comes back full, and stops when it does not", async () => {
    expireIntegrationEventPayloads
      .mockResolvedValueOnce(EXPIRY_BATCH_SIZE)
      .mockResolvedValueOnce(EXPIRY_BATCH_SIZE)
      .mockResolvedValueOnce(7);

    await expect(sweepExpiredPayloads(NOW)).resolves.toEqual({
      swept_workspaces: 1,
      expired_payloads: EXPIRY_BATCH_SIZE * 2 + 7
    });
    expect(expireIntegrationEventPayloads).toHaveBeenCalledTimes(3);
  });

  it("stops at the per-tenant ceiling so one backlog cannot own the whole pass", async () => {
    expireIntegrationEventPayloads.mockResolvedValue(EXPIRY_BATCH_SIZE);

    await sweepExpiredPayloads(NOW);

    expect(expireIntegrationEventPayloads).toHaveBeenCalledTimes(MAX_EXPIRY_BATCHES_PER_WORKSPACE);
  });

  it("clears the other tenants when one of them fails", async () => {
    claimWorkspacesWithExpiringPayloads.mockResolvedValue([
      { workspace_id: first_workspace, anchor_integration_event_id: first_anchor },
      { workspace_id: second_workspace, anchor_integration_event_id: second_anchor }
    ]);
    expireIntegrationEventPayloads
      .mockRejectedValueOnce(new Error("deadlock detected"))
      .mockResolvedValueOnce(3);

    await expect(sweepExpiredPayloads(NOW)).resolves.toEqual({
      swept_workspaces: 1,
      expired_payloads: 3
    });
  });

  it("refuses a sweep interval that would run the retention every few seconds", () => {
    expect(payloadExpiryIntervalMs(undefined)).toBe(3_600_000);
    expect(payloadExpiryIntervalMs("60000")).toBe(60_000);
    expect(() => payloadExpiryIntervalMs("1000")).toThrow(/at least 60000/);
    expect(() => payloadExpiryIntervalMs("nem numero")).toThrow(/at least 60000/);
  });
});
