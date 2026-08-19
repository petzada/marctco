import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimWorkspacesWithOverdueOpportunities = vi.fn();
const sweepWorkspaceOpportunityClock = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  claimWorkspacesWithOverdueOpportunities,
  sweepWorkspaceOpportunityClock,
  createJobContext
}));

const { DEFAULT_OPPORTUNITY_CLOCK_INTERVAL_MS, opportunityClockIntervalMs, sweepOpportunityClocks } =
  await import("./opportunity-clock-sweep");

const first_workspace = randomUUID();
const second_workspace = randomUUID();
const NOW = new Date("2026-08-19T12:00:00.000Z");

describe("sweepOpportunityClocks", () => {
  beforeEach(() => {
    claimWorkspacesWithOverdueOpportunities.mockReset().mockResolvedValue([
      { workspace_id: first_workspace }
    ]);
    sweepWorkspaceOpportunityClock.mockReset().mockResolvedValue({ upserted: 0, resolved: 0 });
    createJobContext.mockClear();
  });

  it("opens each tenant with a scheduled-sweep JobContext, never an event anchor", async () => {
    await sweepOpportunityClocks(NOW);

    expect(createJobContext).toHaveBeenCalledWith({
      workspace_id: first_workspace,
      origin: { type: "scheduled_sweep", sweep: "OPPORTUNITY_CLOCK" }
    });
    expect(sweepWorkspaceOpportunityClock).toHaveBeenCalledWith(
      {
        workspace_id: first_workspace,
        origin: { type: "scheduled_sweep", sweep: "OPPORTUNITY_CLOCK" }
      },
      NOW
    );
  });

  it("clears the other tenants when one of them fails", async () => {
    claimWorkspacesWithOverdueOpportunities.mockResolvedValue([
      { workspace_id: first_workspace },
      { workspace_id: second_workspace }
    ]);
    sweepWorkspaceOpportunityClock
      .mockRejectedValueOnce(new Error("deadlock detected"))
      .mockResolvedValueOnce({ upserted: 2, resolved: 1 });

    await expect(sweepOpportunityClocks(NOW)).resolves.toEqual({
      swept_workspaces: 1,
      upserted: 2,
      resolved: 1
    });
  });

  it("runs the pass even when Redis is unset", async () => {
    const previous = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      await expect(sweepOpportunityClocks(NOW)).resolves.toEqual({
        swept_workspaces: 1,
        upserted: 0,
        resolved: 0
      });
    } finally {
      if (previous === undefined) {
        delete process.env.REDIS_URL;
      } else {
        process.env.REDIS_URL = previous;
      }
    }
  });

  it("refuses a sweep interval that would run the clocks every few seconds", () => {
    expect(opportunityClockIntervalMs(undefined)).toBe(DEFAULT_OPPORTUNITY_CLOCK_INTERVAL_MS);
    expect(opportunityClockIntervalMs("60000")).toBe(60_000);
    expect(() => opportunityClockIntervalMs("1000")).toThrow(/at least 60000/);
    expect(() => opportunityClockIntervalMs("nem numero")).toThrow(/at least 60000/);
  });
});
