import { describe, expect, it } from "vitest";
import { markersFor } from "./markers.js";

describe("markersFor", () => {
  it("returns the missing-phone marker for a lead that cannot receive calls or WhatsApp", () => {
    expect(markersFor({ missing_phone: true }, [])).toEqual(["MISSING_PHONE"]);
  });

  it("does not turn absent financing data into a marker", () => {
    expect(markersFor({ missing_phone: false }, [])).toEqual([]);
  });

  it("returns each marker once, in the domain order, when a lead has three warnings", () => {
    expect(
      markersFor(
        { missing_phone: true },
        [
          { type: "POSSIBLE_DUPLICATE" },
          { type: "IDENTITY_CONFLICT" },
          { type: "POSSIBLE_DUPLICATE" }
        ]
      )
    ).toEqual(["MISSING_PHONE", "IDENTITY_CONFLICT", "POSSIBLE_DUPLICATE"]);
  });
});
