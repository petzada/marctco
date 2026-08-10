import { describe, expect, it } from "vitest";
import {
  formatPayloadRetentionNotice,
  integrationEventPayloadExpiresAt,
  isPayloadExpired,
  PAYLOAD_RETENTION_DAYS
} from "./integration-payload-expiry";

describe("integrationEventPayloadExpiresAt", () => {
  it("is received_at + 90 days, with no stored column behind it", () => {
    const received_at = new Date("2026-08-01T00:00:00.000Z");
    expect(PAYLOAD_RETENTION_DAYS).toBe(90);
    expect(integrationEventPayloadExpiresAt(received_at)).toEqual(
      new Date("2026-10-30T00:00:00.000Z")
    );
  });
});

describe("isPayloadExpired", () => {
  it("is true only when raw reads null — the single cause ADR-0014 describes", () => {
    expect(isPayloadExpired(null)).toBe(true);
    expect(isPayloadExpired({})).toBe(false);
    expect(isPayloadExpired({ name: "Maria" })).toBe(false);
  });
});

describe("formatPayloadRetentionNotice", () => {
  it("says when the content will leave, before the expiry date", () => {
    const received_at = new Date("2026-08-01T00:00:00.000Z");
    const now = new Date("2026-08-10T00:00:00.000Z");
    expect(formatPayloadRetentionNotice(received_at, now)).toContain("fica guardado até");
  });

  it("says the content already left, after the expiry date", () => {
    const received_at = new Date("2020-01-01T00:00:00.000Z");
    const now = new Date("2026-08-10T00:00:00.000Z");
    expect(formatPayloadRetentionNotice(received_at, now)).toContain("expirou em");
  });
});
