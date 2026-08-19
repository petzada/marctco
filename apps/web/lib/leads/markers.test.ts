import { describe, expect, it } from "vitest";
import type { Marker } from "@marctco/domain";
import { markerPresentation } from "./markers.js";

describe("markerPresentation", () => {
  it("labels every marker in PT-BR with a distinct icon", () => {
    const markers: Marker[] = [
      "MISSING_PHONE",
      "IDENTITY_CONFLICT",
      "POSSIBLE_DUPLICATE",
      "FIRST_CONTACT_SLA_BREACHED",
      "STAGNANT"
    ];
    const presentations = markers.map((marker) => markerPresentation(marker));

    expect(presentations).toEqual([
      { label: "Sem telefone", icon: "phone-off" },
      { label: "Identidade em conflito", icon: "user-question" },
      { label: "Possível duplicado", icon: "copy" },
      { label: "SLA estourado", icon: "clock" },
      { label: "Parado", icon: "pause" }
    ]);
    // One entry per marker, one icon each — never two markers sharing a
    // presentation, which would defeat "one icon reads what this lead has".
    expect(new Set(presentations.map((p) => p.icon)).size).toBe(markers.length);
  });

  it("throws on an unhandled marker instead of silently rendering nothing", () => {
    expect(() => markerPresentation("FUTURE_MARKER" as Marker)).toThrow(/Unhandled marker/);
  });
});
