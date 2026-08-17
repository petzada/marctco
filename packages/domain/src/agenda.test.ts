import { describe, expect, it } from "vitest";
import {
  MAX_AGENDA_RANGE_MS,
  agendaBoundsForView,
  parseAgendaInterval,
  shiftAgendaDate,
  todayAgendaDate
} from "./agenda.js";

describe("parseAgendaInterval", () => {
  const from = new Date("2026-08-17T03:00:00.000Z");

  it("accepts a required half-open window up to one week", () => {
    const to = new Date(from.getTime() + MAX_AGENDA_RANGE_MS);
    expect(parseAgendaInterval({ from, to })).toEqual({ ok: true, from, to });
  });

  it("refuses a missing, inverted or empty range", () => {
    expect(parseAgendaInterval({ from, to: from }).ok).toBe(false);
    expect(parseAgendaInterval({ from, to: new Date(from.getTime() - 1) })).toEqual({
      ok: false,
      reason: "INVALID_RANGE"
    });
    expect(parseAgendaInterval({ from: new Date(Number.NaN), to: new Date(from.getTime() + 1) })).toEqual({
      ok: false,
      reason: "INVALID_RANGE"
    });
  });

  it("refuses a calendar without a ceiling", () => {
    const to = new Date(from.getTime() + MAX_AGENDA_RANGE_MS + 1);
    expect(parseAgendaInterval({ from, to })).toEqual({ ok: false, reason: "RANGE_TOO_LONG" });
  });
});

describe("agendaBoundsForView", () => {
  it("maps a day view to that civil date in America/Sao_Paulo", () => {
    const bounds = agendaBoundsForView({ view: "day", date: "2026-08-17" });
    expect(bounds.ok).toBe(true);
    if (!bounds.ok) return;
    expect(bounds.from.toISOString()).toBe("2026-08-17T03:00:00.000Z");
    expect(bounds.to.toISOString()).toBe("2026-08-18T03:00:00.000Z");
    expect(bounds.to.getTime() - bounds.from.getTime()).toBe(24 * 60 * 60 * 1000);
  });

  it("maps a week view to Monday–Monday of the week that contains the date", () => {
    const bounds = agendaBoundsForView({ view: "week", date: "2026-08-19" });
    expect(bounds.ok).toBe(true);
    if (!bounds.ok) return;
    expect(bounds.from.toISOString()).toBe("2026-08-17T03:00:00.000Z");
    expect(bounds.to.toISOString()).toBe("2026-08-24T03:00:00.000Z");
    expect(bounds.to.getTime() - bounds.from.getTime()).toBe(MAX_AGENDA_RANGE_MS);
  });

  it("refuses a date that is not YYYY-MM-DD", () => {
    expect(agendaBoundsForView({ view: "day", date: "17/08/2026" })).toEqual({
      ok: false,
      reason: "INVALID_RANGE"
    });
  });
});

describe("shiftAgendaDate", () => {
  it("moves a civil date by whole days", () => {
    expect(shiftAgendaDate("2026-08-17", 1)).toBe("2026-08-18");
    expect(shiftAgendaDate("2026-08-17", -7)).toBe("2026-08-10");
  });
});

describe("todayAgendaDate", () => {
  it("reads the civil date in America/Sao_Paulo, not UTC", () => {
    expect(todayAgendaDate(new Date("2026-08-17T02:00:00.000Z"))).toBe("2026-08-16");
    expect(todayAgendaDate(new Date("2026-08-17T03:00:00.000Z"))).toBe("2026-08-17");
  });
});
