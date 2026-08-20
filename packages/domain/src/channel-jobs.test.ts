import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CHANNEL_OUTBOUND_INITIAL_DELAY_MS,
  CHANNEL_OUTBOUND_JOB,
  CHANNEL_OUTBOUND_QUEUE,
  CHANNEL_OUTBOUND_RATE_LIMIT_MAX,
  CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS,
  channelOutboundJobId
} from "./channel-jobs.js";

describe("channelOutboundJobId", () => {
  it("gives the same attempt the same job id, however often it is republished", () => {
    const attempt_id = randomUUID();

    expect(channelOutboundJobId(attempt_id)).toBe(channelOutboundJobId(attempt_id));
    expect(channelOutboundJobId(attempt_id)).not.toBe(channelOutboundJobId(randomUUID()));
  });

  it("never contains a colon, which BullMQ refuses in a custom id", () => {
    expect(channelOutboundJobId(randomUUID())).not.toContain(":");
  });

  it("is derived from the attempt id and nothing else", () => {
    const attempt_id = "018f4d57-2db2-7c1b-bff0-f2fcb13a46f7";
    expect(channelOutboundJobId(attempt_id)).toBe(`${CHANNEL_OUTBOUND_JOB}-${attempt_id}`);
  });
});

describe("channel outbound queue defaults", () => {
  it("fixes the dedicated queue name and conservative anti-ban defaults", () => {
    expect(CHANNEL_OUTBOUND_QUEUE).toBe("channel-outbound");
    expect(CHANNEL_OUTBOUND_JOB).toBe("channel-outbound");
    expect(CHANNEL_OUTBOUND_INITIAL_DELAY_MS).toBe(30_000);
    expect(CHANNEL_OUTBOUND_RATE_LIMIT_MAX).toBe(6);
    expect(CHANNEL_OUTBOUND_RATE_LIMIT_WINDOW_MS).toBe(60_000);
  });
});
