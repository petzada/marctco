import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getChannelOutboundAttempt = vi.fn();
const loadChannelOutboundSend = vi.fn();
const beginChannelOutboundAttempt = vi.fn();
const acceptChannelOutboundAttempt = vi.fn();
const failChannelOutboundAttempt = vi.fn();
const readWorkspaceFeatureFlags = vi.fn();
const createJobContext = vi.fn((input: unknown) => input);
const withResolvedFeatureFlags = vi.fn((context: unknown, flags: unknown) => ({
  ...(context as object),
  feature_flags: flags
}));

vi.mock("@marctco/db", () => ({
  getChannelOutboundAttempt,
  loadChannelOutboundSend,
  beginChannelOutboundAttempt,
  acceptChannelOutboundAttempt,
  failChannelOutboundAttempt,
  readWorkspaceFeatureFlags,
  createJobContext,
  withResolvedFeatureFlags
}));

const { finishChannelOutboundWorkerJob, processChannelOutboundJob } = await import("./channel-outbound-job.js");

const workspace_id = randomUUID();
const attempt_id = randomUUID();
const INSTANCE = "marctco_11111111111141118111111111111111";

const queued = {
  id: attempt_id,
  dispatch_status: "DISPATCHED",
  delivery_status: "QUEUED"
};

const sendable = {
  instance_name: INSTANCE,
  pairing_state: "CONNECTED",
  destination_e164: "+5511987654321",
  trigger: "ON_ASSIGNMENT",
  template_body:
    "Olá {{lead_name}}, sou {{attendant_name}} da {{workspace_name}}. Meu WhatsApp é {{attendant_phone}}.",
  lead_name: "Maria",
  workspace_name: "Assessoria Horizonte",
  attendant_name: "Ana",
  attendant_phone_e164: "+5511912345678"
};

function flagsOn() {
  return {
    auto_primeiro_contato: true,
    score_cabimento_llm: false,
    resumo_handoff_llm: false
  };
}

describe("processChannelOutboundJob", () => {
  const sendText = vi.fn();
  const consume = vi.fn().mockReturnValue({ allowed: true, remaining: 5 });

  beforeEach(() => {
    getChannelOutboundAttempt.mockReset().mockResolvedValue(queued);
    loadChannelOutboundSend.mockReset().mockResolvedValue(sendable);
    beginChannelOutboundAttempt.mockReset().mockResolvedValue({
      ...queued,
      delivery_status: "PROCESSING"
    });
    acceptChannelOutboundAttempt.mockReset().mockResolvedValue({
      ...queued,
      delivery_status: "SENT"
    });
    failChannelOutboundAttempt.mockReset().mockResolvedValue({
      ...queued,
      delivery_status: "FAILED"
    });
    readWorkspaceFeatureFlags.mockReset().mockResolvedValue(flagsOn());
    createJobContext.mockClear();
    withResolvedFeatureFlags.mockClear();
    sendText.mockReset().mockResolvedValue({ kind: "accepted" });
    consume.mockReset().mockReturnValue({ allowed: true, remaining: 5 });
  });

  function process() {
    return processChannelOutboundJob(
      { attempt_id, workspace_id },
      { provider: { sendText }, rateLimiter: { consume } }
    );
  }

  it("builds channel_outbound JobContext per workspace and attaches resolved flags", async () => {
    await process();

    expect(createJobContext).toHaveBeenCalledWith({
      workspace_id,
      origin: { type: "channel_outbound", attempt_id }
    });
    expect(readWorkspaceFeatureFlags).toHaveBeenCalledWith(
      expect.objectContaining({ workspace_id })
    );
    expect(withResolvedFeatureFlags).toHaveBeenCalledWith(
      expect.objectContaining({ origin: { type: "channel_outbound", attempt_id } }),
      flagsOn()
    );
  });

  it("marks PROCESSING, calls sendText once, then SENT, with HTTP outside both transactions", async () => {
    const order: string[] = [];
    beginChannelOutboundAttempt.mockImplementation(() => {
      order.push("begin");
      return Promise.resolve({ ...queued, delivery_status: "PROCESSING" });
    });
    sendText.mockImplementation(() => {
      order.push("http");
      return Promise.resolve({ kind: "accepted" });
    });
    acceptChannelOutboundAttempt.mockImplementation(() => {
      order.push("accept");
      return Promise.resolve({ ...queued, delivery_status: "SENT" });
    });

    const processed = await process();

    expect(order).toEqual(["begin", "http", "accept"]);
    expect(sendText).toHaveBeenCalledOnce();
    expect(sendText).toHaveBeenCalledWith({
      instance_name: INSTANCE,
      number: "5511987654321",
      text: "Olá Maria, sou Ana da Assessoria Horizonte. Meu WhatsApp é +5511912345678."
    });
    expect(processed.outcome).toBe("sent");
    expect(JSON.stringify(processed)).not.toContain("5511987654321");
    expect(JSON.stringify(processed)).not.toContain("Maria");
  });

  it("does not call sendText again for an already SENT attempt", async () => {
    getChannelOutboundAttempt.mockResolvedValue({
      ...queued,
      delivery_status: "SENT"
    });

    await expect(process()).resolves.toMatchObject({ outcome: "skipped" });
    expect(sendText).not.toHaveBeenCalled();
    expect(beginChannelOutboundAttempt).not.toHaveBeenCalled();
  });

  it("fails PROCESSING without a second sendText after a crash past HTTP", async () => {
    getChannelOutboundAttempt.mockResolvedValue({
      ...queued,
      delivery_status: "PROCESSING"
    });

    await expect(process()).resolves.toMatchObject({ outcome: "failed" });
    expect(sendText).not.toHaveBeenCalled();
    expect(failChannelOutboundAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "UNCERTAIN_EXTERNAL" })
    );
  });

  it("maps a 4xx to FAILED KNOWN_REFUSAL after exactly one sendText", async () => {
    sendText.mockResolvedValue({ kind: "http_error", status: 400 });

    await expect(process()).resolves.toMatchObject({ outcome: "failed" });
    expect(sendText).toHaveBeenCalledOnce();
    expect(failChannelOutboundAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "KNOWN_REFUSAL" })
    );
    expect(acceptChannelOutboundAttempt).not.toHaveBeenCalled();
  });

  it("maps 5xx, timeout and network to FAILED UNCERTAIN_EXTERNAL after one sendText", async () => {
    for (const result of [
      { kind: "http_error", status: 500 },
      { kind: "timeout" },
      { kind: "network" }
    ] as const) {
      sendText.mockReset().mockResolvedValue(result);
      failChannelOutboundAttempt.mockClear();
      beginChannelOutboundAttempt.mockClear();

      await expect(process()).resolves.toMatchObject({ outcome: "failed" });
      expect(sendText).toHaveBeenCalledOnce();
      expect(failChannelOutboundAttempt).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ reason: "UNCERTAIN_EXTERNAL" })
      );
    }
  });

  it("defers before PROCESSING when the workspace is rate limited", async () => {
    consume.mockReturnValue({ allowed: false, remaining: 0, retry_after_ms: 10_000 });

    await expect(process()).resolves.toMatchObject({
      outcome: "deferred",
      retry_after_ms: 10_000
    });
    expect(beginChannelOutboundAttempt).not.toHaveBeenCalled();
    expect(sendText).not.toHaveBeenCalled();
  });

  it("lets another workspace send while one is rate limited", async () => {
    const other_workspace = randomUUID();
    const other_attempt = randomUUID();
    consume.mockImplementation((key: string) =>
      key === workspace_id
        ? { allowed: false, remaining: 0, retry_after_ms: 10_000 }
        : { allowed: true, remaining: 5 }
    );

    await expect(process()).resolves.toMatchObject({ outcome: "deferred" });
    expect(sendText).not.toHaveBeenCalled();

    await expect(
      processChannelOutboundJob(
        { attempt_id: other_attempt, workspace_id: other_workspace },
        { provider: { sendText }, rateLimiter: { consume } }
      )
    ).resolves.toMatchObject({ outcome: "sent" });
    expect(sendText).toHaveBeenCalledOnce();
  });

  it("fails a disconnected instance without calling sendText", async () => {
    loadChannelOutboundSend.mockResolvedValue({
      ...sendable,
      pairing_state: "DISCONNECTED"
    });

    await expect(process()).resolves.toMatchObject({ outcome: "failed" });
    expect(sendText).not.toHaveBeenCalled();
    expect(failChannelOutboundAttempt).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ reason: "INSTANCE_NOT_CONNECTED" })
    );
  });

  it("refuses a job whose data is not the pair of identifiers", async () => {
    await expect(processChannelOutboundJob(null, { provider: { sendText } })).rejects.toThrow(
      /identifiers/i
    );
    expect(getChannelOutboundAttempt).not.toHaveBeenCalled();
  });
});

describe("finishChannelOutboundWorkerJob", () => {
  it("delays the BullMQ job without consuming an attempt when rate limited", async () => {
    const moveToDelayed = vi.fn().mockResolvedValue(undefined);
    const processed = {
      attempt_id,
      workspace_id,
      outcome: "deferred" as const,
      retry_after_ms: 12_000
    };

    await expect(
      finishChannelOutboundWorkerJob({ moveToDelayed }, "worker-token", processed)
    ).rejects.toMatchObject({ name: "DelayedError" });

    expect(moveToDelayed).toHaveBeenCalledOnce();
    const [timestamp, token] = moveToDelayed.mock.calls[0] as [number, string];
    expect(token).toBe("worker-token");
    expect(timestamp).toBeGreaterThanOrEqual(Date.now() + 11_000);
    expect(timestamp).toBeLessThanOrEqual(Date.now() + 13_000);
  });

  it("returns sent, failed and skipped outcomes unchanged", async () => {
    const moveToDelayed = vi.fn();
    for (const outcome of ["sent", "failed", "skipped"] as const) {
      await expect(
        finishChannelOutboundWorkerJob(
          { moveToDelayed },
          "worker-token",
          { attempt_id, workspace_id, outcome }
        )
      ).resolves.toMatchObject({ outcome });
    }
    expect(moveToDelayed).not.toHaveBeenCalled();
  });
});
