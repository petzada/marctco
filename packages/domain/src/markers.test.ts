import { describe, expect, it } from "vitest";
import type { FirstContactSla } from "./first-contact-sla.js";
import { markersFor } from "./markers.js";

const pending: FirstContactSla = { state: "PENDING", duration_ms: 1_000 };
const met: FirstContactSla = { state: "MET", duration_ms: 1_000 };
const breached: FirstContactSla = { state: "BREACHED", duration_ms: 1_000 };

describe("markersFor", () => {
  it("returns the missing-phone marker for a lead that cannot receive calls or WhatsApp", () => {
    expect(markersFor({ missing_phone: true }, [], pending)).toEqual(["MISSING_PHONE"]);
  });

  it("does not turn absent financing data into a marker", () => {
    expect(markersFor({ missing_phone: false }, [], pending)).toEqual([]);
  });

  it("returns each marker once, in the domain order, when a lead has three warnings", () => {
    expect(
      markersFor(
        { missing_phone: true },
        [
          { type: "POSSIBLE_DUPLICATE" },
          { type: "IDENTITY_CONFLICT" },
          { type: "POSSIBLE_DUPLICATE" }
        ],
        pending
      )
    ).toEqual(["MISSING_PHONE", "IDENTITY_CONFLICT", "POSSIBLE_DUPLICATE"]);
  });

  it("adds the breached SLA marker after the intake warnings, without dropping them", () => {
    expect(
      markersFor(
        { missing_phone: true },
        [{ type: "IDENTITY_CONFLICT" }, { type: "POSSIBLE_DUPLICATE" }],
        breached
      )
    ).toEqual([
      "MISSING_PHONE",
      "IDENTITY_CONFLICT",
      "POSSIBLE_DUPLICATE",
      "FIRST_CONTACT_SLA_BREACHED"
    ]);
  });

  it("does not mark PENDING or MET as a breached SLA", () => {
    expect(markersFor({ missing_phone: false }, [], pending)).toEqual([]);
    expect(markersFor({ missing_phone: false }, [], met)).toEqual([]);
  });

  it("omits the SLA marker when sla is omitted, so callers from before ticket 03 stay safe", () => {
    expect(markersFor({ missing_phone: true }, [{ type: "IDENTITY_CONFLICT" }], breached)).toContain(
      "FIRST_CONTACT_SLA_BREACHED"
    );
    expect(markersFor({ missing_phone: true }, [{ type: "IDENTITY_CONFLICT" }])).toEqual([
      "MISSING_PHONE",
      "IDENTITY_CONFLICT"
    ]);
  });
});
