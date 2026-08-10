import { describe, expect, it } from "vitest";
import { decodeLeadCursor, encodeLeadCursor } from "./cursor.js";

const SAMPLE_ID = "11111111-1111-1111-1111-111111111111";

describe("lead list cursor", () => {
  it("round-trips through encode/decode", () => {
    const cursor = { arrived_at: new Date("2026-08-11T12:00:00.000Z"), id: SAMPLE_ID };
    const decoded = decodeLeadCursor(encodeLeadCursor(cursor));

    expect(decoded).toEqual(cursor);
  });

  it("treats a missing value as no cursor — the first page", () => {
    expect(decodeLeadCursor(undefined)).toBeUndefined();
    expect(decodeLeadCursor(null)).toBeUndefined();
    expect(decodeLeadCursor("")).toBeUndefined();
  });

  it("degrades a tampered or malformed cursor to no cursor instead of throwing", () => {
    expect(decodeLeadCursor("not-a-cursor")).toBeUndefined();
    expect(decodeLeadCursor(`not-a-date_${SAMPLE_ID}`)).toBeUndefined();
    expect(decodeLeadCursor("2026-08-11T12:00:00.000Z_not-a-uuid")).toBeUndefined();
  });
});
