import { describe, expect, it } from "vitest";
import { daysInQuarantine, formatQuarantineWait } from "./quarantine-wait-time";

describe("daysInQuarantine", () => {
  it("is the whole number of days between receipt and now", () => {
    const received_at = new Date("2026-08-01T10:00:00.000Z");
    const now = new Date("2026-08-04T09:00:00.000Z");
    expect(daysInQuarantine(received_at, now)).toBe(2);
  });

  it("never goes negative even if now precedes received_at", () => {
    const received_at = new Date("2026-08-04T00:00:00.000Z");
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(daysInQuarantine(received_at, now)).toBe(0);
  });
});

describe("formatQuarantineWait", () => {
  it("says 'recebido hoje' for same-day", () => {
    const received_at = new Date("2026-08-01T10:00:00.000Z");
    const now = new Date("2026-08-01T18:00:00.000Z");
    expect(formatQuarantineWait(received_at, now)).toBe("recebido hoje");
  });

  it("uses singular for exactly one day", () => {
    const received_at = new Date("2026-08-01T10:00:00.000Z");
    const now = new Date("2026-08-02T12:00:00.000Z");
    expect(formatQuarantineWait(received_at, now)).toBe("esperando há 1 dia");
  });

  it("uses plural for more than one day", () => {
    const received_at = new Date("2026-08-01T10:00:00.000Z");
    const now = new Date("2026-08-10T12:00:00.000Z");
    expect(formatQuarantineWait(received_at, now)).toBe("esperando há 9 dias");
  });
});
