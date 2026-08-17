import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { agendaHref, agendaListOptions, resolveAgendaQuery } from "./search-params";

const slug = "workspace-slug";
const responsible = randomUUID();
const tag = randomUUID();
const pipeline = randomUUID();

describe("resolveAgendaQuery", () => {
  it("reads view, interval date and narrowing filters from the URL", () => {
    expect(
      resolveAgendaQuery({
        view: "week",
        date: "2026-08-19",
        responsible,
        tag,
        pipeline
      })
    ).toEqual({
      view: "week",
      date: "2026-08-19",
      responsible_user_id: responsible,
      tag_id: tag,
      pipeline_id: pipeline
    });
  });

  it("drops unknown view, malformed date and non-UUID filters instead of widening", () => {
    const resolved = resolveAgendaQuery({
      view: "month",
      date: "19/08/2026",
      responsible: "all",
      tag: "ACR",
      pipeline: "comercial"
    });
    expect(resolved.view).toBe("day");
    expect(resolved.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(resolved.responsible_user_id).toBeUndefined();
    expect(resolved.tag_id).toBeUndefined();
    expect(resolved.pipeline_id).toBeUndefined();
  });
});

describe("agendaHref and agendaListOptions", () => {
  it("keeps the same view in a shareable URL and bounds a week to seven days", () => {
    const query = resolveAgendaQuery({ view: "week", date: "2026-08-19", tag });
    expect(agendaHref(slug, query)).toBe(
      `/workspace/${slug}/agenda?view=week&date=2026-08-19&tag=${tag}`
    );
    expect(agendaHref(slug, query, { view: "day" })).toBe(
      `/workspace/${slug}/agenda?date=2026-08-19&tag=${tag}`
    );
    const options = agendaListOptions(query);
    expect(options.from.toISOString()).toBe("2026-08-17T03:00:00.000Z");
    expect(options.to.toISOString()).toBe("2026-08-24T03:00:00.000Z");
    expect(options.tag_id).toBe(tag);
  });
});
