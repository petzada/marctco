import { describe, expect, it } from "vitest";
import { planPossibleDuplicateResolution } from "./intake-review-resolution.js";

const resolved_at = new Date("2026-08-10T15:30:00.000Z");
const common = {
  opportunity_id: "11111111-1111-4111-8111-111111111111",
  related_opportunity_id: "22222222-2222-4222-8222-222222222222",
  resolved_by_user_id: "33333333-3333-4333-8333-333333333333",
  resolved_at,
  reason: "  Conferido com o cliente  "
} as const;

describe("planPossibleDuplicateResolution", () => {
  it("keeps two different financings independent and preserves the audit facts", () => {
    expect(
      planPossibleDuplicateResolution({ ...common, resolution: "NEW_FINANCING" })
    ).toEqual({
      kind: "NEW_FINANCING",
      opportunity_id: common.opportunity_id,
      related_opportunity_id: common.related_opportunity_id,
      resolved_by_user_id: common.resolved_by_user_id,
      resolved_at,
      reason: "Conferido com o cliente"
    });
  });

  it("makes the newer reviewed card the absorbed tombstone and the related card canonical", () => {
    expect(
      planPossibleDuplicateResolution({ ...common, resolution: "SAME_FINANCING" })
    ).toEqual({
      kind: "SAME_FINANCING",
      absorbed_opportunity_id: common.opportunity_id,
      canonical_opportunity_id: common.related_opportunity_id,
      resolved_by_user_id: common.resolved_by_user_id,
      resolved_at,
      reason: "Conferido com o cliente"
    });
  });

  it("archives only the reviewed card when the submission is invalid or spam", () => {
    expect(
      planPossibleDuplicateResolution({ ...common, resolution: "INVALID_OR_SPAM" })
    ).toEqual({
      kind: "INVALID_OR_SPAM",
      opportunity_id: common.opportunity_id,
      related_opportunity_id: common.related_opportunity_id,
      resolved_by_user_id: common.resolved_by_user_id,
      resolved_at,
      reason: "Conferido com o cliente"
    });
  });

  it("refuses to create an unaudited resolution", () => {
    expect(() =>
      planPossibleDuplicateResolution({
        ...common,
        resolution: "NEW_FINANCING",
        reason: "   "
      })
    ).toThrow(/reason/i);
  });
});
