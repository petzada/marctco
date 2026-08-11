import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const markIntegrationEventFailed = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);

vi.mock("@marctco/db", () => ({ markIntegrationEventFailed, createJobContext }));

const { jobAttemptsExhausted, recordDeadLetter } = await import("./dead-letter.js");

const workspace_id = randomUUID();
const integration_event_id = randomUUID();
const data = { workspace_id, integration_event_id };

function failedJob(attemptsMade: number, attempts: number | undefined = 5) {
  return { data, attemptsMade, opts: { attempts } };
}

describe("recordDeadLetter", () => {
  beforeEach(() => {
    markIntegrationEventFailed.mockReset().mockResolvedValue(true);
    createJobContext.mockClear();
  });

  it("writes the dead letter only after the last attempt is spent", async () => {
    await expect(recordDeadLetter(failedJob(2), new Error("boom"))).resolves.toBe("retry_pending");
    expect(markIntegrationEventFailed).not.toHaveBeenCalled();

    await expect(recordDeadLetter(failedJob(5), new Error("boom"))).resolves.toBe("dead_lettered");
    expect(createJobContext).toHaveBeenCalledWith({ workspace_id, integration_event_id });
  });

  it("scrubs the reason before it lands in a column the payload expiry never reaches", async () => {
    const echoed = new Error(
      'duplicate key value violates unique constraint\nDETAIL: Key (cpf)=(529.982.247-25) already exists.'
    );

    await recordDeadLetter(failedJob(5), echoed);

    const [, reason] = markIntegrationEventFailed.mock.calls[0] as [unknown, string];
    expect(reason).toContain("duplicate key value violates unique constraint");
    expect(reason).not.toContain("529.982.247-25");
  });

  it("reports the event that had already settled instead of relabelling it", async () => {
    markIntegrationEventFailed.mockResolvedValue(false);
    await expect(recordDeadLetter(failedJob(5), new Error("boom"))).resolves.toBe("already_settled");
  });

  it("does nothing for a job whose data cannot name an event", async () => {
    await expect(recordDeadLetter(undefined, new Error("boom"))).resolves.toBe("unusable");
    await expect(
      recordDeadLetter({ data: { workspace_id }, attemptsMade: 5, opts: { attempts: 5 } }, null)
    ).resolves.toBe("unusable");
    expect(markIntegrationEventFailed).not.toHaveBeenCalled();
  });

  it("treats a job with no configured attempts as one attempt", () => {
    expect(jobAttemptsExhausted(0, undefined)).toBe(false);
    expect(jobAttemptsExhausted(1, undefined)).toBe(true);
    expect(jobAttemptsExhausted(4, 5)).toBe(false);
    expect(jobAttemptsExhausted(5, 5)).toBe(true);
  });
});
