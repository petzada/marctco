import { randomUUID } from "node:crypto";
import { channelOutboundJobId } from "@marctco/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";

const claimPendingChannelAttempts = vi.fn();
const dispatchChannelOutboundAttempt = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({
  claimPendingChannelAttempts,
  dispatchChannelOutboundAttempt,
  createJobContext
}));

const {
  dispatchIntervalMs,
  dispatchPassFailed,
  dispatchPendingChannelAttempts,
  nextDispatchDelayMs,
  MAX_DISPATCH_BACKOFF_MS
} = await import("./channel-dispatcher");

const workspace_a = randomUUID();
const workspace_b = randomUUID();
const first_attempt_id = randomUUID();
const second_attempt_id = randomUUID();

describe("dispatchPendingChannelAttempts", () => {
  beforeEach(() => {
    claimPendingChannelAttempts
      .mockReset()
      .mockResolvedValue([{ attempt_id: first_attempt_id, workspace_id: workspace_a }]);
    dispatchChannelOutboundAttempt.mockReset().mockResolvedValue(undefined);
    createJobContext.mockClear();
  });

  it("publishes a job carrying identifiers only, under a deterministic id", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);

    await expect(dispatchPendingChannelAttempts({ publish })).resolves.toEqual({
      claimed: 1,
      dispatched: 1
    });
    expect(publish).toHaveBeenCalledWith(channelOutboundJobId(first_attempt_id), {
      attempt_id: first_attempt_id,
      workspace_id: workspace_a
    });
    expect(createJobContext).toHaveBeenCalledWith({
      workspace_id: workspace_a,
      origin: { type: "channel_outbound", attempt_id: first_attempt_id }
    });
  });

  it("records DISPATCHED only after the queue accepted the job", async () => {
    const order: string[] = [];
    const publish = vi.fn().mockImplementation(() => {
      order.push("publish");
      return Promise.resolve();
    });
    dispatchChannelOutboundAttempt.mockImplementation(() => {
      order.push("mark");
      return Promise.resolve();
    });

    await dispatchPendingChannelAttempts({ publish });

    expect(order).toEqual(["publish", "mark"]);
  });

  it("leaves an attempt pending when the queue is unreachable", async () => {
    const publish = vi.fn().mockRejectedValue(new Error("ECONNREFUSED"));

    await expect(dispatchPendingChannelAttempts({ publish })).resolves.toEqual({
      claimed: 1,
      dispatched: 0
    });
    expect(dispatchChannelOutboundAttempt).not.toHaveBeenCalled();
  });

  it("is idempotent: a second publish of the same attempt id is the same job", async () => {
    const publish = vi.fn().mockResolvedValue(undefined);

    await dispatchPendingChannelAttempts({ publish });
    claimPendingChannelAttempts.mockResolvedValue([
      { attempt_id: first_attempt_id, workspace_id: workspace_a }
    ]);
    await dispatchPendingChannelAttempts({ publish });

    expect(publish).toHaveBeenCalledTimes(2);
    expect(publish.mock.calls[0]).toEqual(publish.mock.calls[1]);
    expect(publish.mock.calls[0]?.[0]).toBe(channelOutboundJobId(first_attempt_id));
  });

  it("publishes a recovered lease the same way as a first claim", async () => {
    const recovered_attempt_id = randomUUID();
    claimPendingChannelAttempts.mockResolvedValue([
      { attempt_id: recovered_attempt_id, workspace_id: workspace_a }
    ]);
    const publish = vi.fn().mockResolvedValue(undefined);

    await expect(dispatchPendingChannelAttempts({ publish })).resolves.toEqual({
      claimed: 1,
      dispatched: 1
    });
    expect(publish).toHaveBeenCalledWith(channelOutboundJobId(recovered_attempt_id), {
      attempt_id: recovered_attempt_id,
      workspace_id: workspace_a
    });
  });

  it("keeps dispatching another workspace after one publish fails", async () => {
    claimPendingChannelAttempts.mockResolvedValue([
      { attempt_id: first_attempt_id, workspace_id: workspace_a },
      { attempt_id: second_attempt_id, workspace_id: workspace_b }
    ]);
    const publish = vi
      .fn()
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce(undefined);

    await expect(dispatchPendingChannelAttempts({ publish })).resolves.toEqual({
      claimed: 2,
      dispatched: 1
    });
    expect(createJobContext).toHaveBeenCalledWith({
      workspace_id: workspace_b,
      origin: { type: "channel_outbound", attempt_id: second_attempt_id }
    });
    expect(dispatchChannelOutboundAttempt).toHaveBeenCalledOnce();
  });

  it("refuses a sweep interval that would hammer the outbox, and defaults without one", () => {
    expect(dispatchIntervalMs(undefined)).toBe(2_000);
    expect(dispatchIntervalMs("5000")).toBe(5_000);
    expect(() => dispatchIntervalMs("10")).toThrow(/at least 250/);
    expect(() => dispatchIntervalMs("nem numero")).toThrow(/at least 250/);
  });

  it("backs off exponentially while the queue is unreachable, up to the cap", () => {
    expect(nextDispatchDelayMs(0, 2_000)).toBe(2_000);
    expect(nextDispatchDelayMs(1, 2_000)).toBe(4_000);
    expect(nextDispatchDelayMs(4, 2_000)).toBe(32_000);
    expect(nextDispatchDelayMs(50, 2_000)).toBe(MAX_DISPATCH_BACKOFF_MS);
  });

  it("only counts a pass as failed when it had work and moved none of it", () => {
    expect(dispatchPassFailed({ claimed: 0, dispatched: 0 })).toBe(false);
    expect(dispatchPassFailed({ claimed: 3, dispatched: 1 })).toBe(false);
    expect(dispatchPassFailed({ claimed: 3, dispatched: 0 })).toBe(true);
  });
});
