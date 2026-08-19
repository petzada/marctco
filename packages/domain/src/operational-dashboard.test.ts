import { describe, expect, it } from "vitest";
import {
  buildOperationalDashboardTiles,
  canReadOperationalDashboard,
  canSeeUnassignedQueueOnDashboard,
  operationalDashboardTileDestination
} from "./operational-dashboard.js";

describe("canReadOperationalDashboard", () => {
  it("allows Supervisor, Gestão and Direção, and refuses Atendente", () => {
    expect(canReadOperationalDashboard("SUPERVISOR")).toBe(true);
    expect(canReadOperationalDashboard("MANAGER")).toBe(true);
    expect(canReadOperationalDashboard("OWNER")).toBe(true);
    expect(canReadOperationalDashboard("ATTENDANT")).toBe(false);
  });
});

describe("canSeeUnassignedQueueOnDashboard", () => {
  it("is only Gestão and Direção — the ownerless queue is not the Supervisor's", () => {
    expect(canSeeUnassignedQueueOnDashboard("MANAGER")).toBe(true);
    expect(canSeeUnassignedQueueOnDashboard("OWNER")).toBe(true);
    expect(canSeeUnassignedQueueOnDashboard("SUPERVISOR")).toBe(false);
    expect(canSeeUnassignedQueueOnDashboard("ATTENDANT")).toBe(false);
  });
});

describe("operationalDashboardTileDestination", () => {
  it("sends each tile to Leads or Agenda with the filter already in the query", () => {
    expect(operationalDashboardTileDestination("sla_breached")).toEqual({
      screen: "leads",
      query: { clock: "sla-breached" }
    });
    expect(operationalDashboardTileDestination("stagnant")).toEqual({
      screen: "leads",
      query: { clock: "stagnant" }
    });
    expect(operationalDashboardTileDestination("unassigned")).toEqual({
      screen: "leads",
      query: { responsible: "unassigned" }
    });
    expect(operationalDashboardTileDestination("overdue_activities")).toEqual({
      screen: "agenda",
      query: { due: "overdue" }
    });
  });
});

describe("buildOperationalDashboardTiles", () => {
  it("always returns the four tiles in the same order, including zeros", () => {
    const tiles = buildOperationalDashboardTiles({
      sla_breached: 2,
      stagnant: 0,
      unassigned: 4,
      overdue_activities: 1
    });
    expect(tiles.map((tile) => tile.id)).toEqual([
      "sla_breached",
      "stagnant",
      "unassigned",
      "overdue_activities"
    ]);
    expect(tiles.map((tile) => tile.count)).toEqual([2, 0, 4, 1]);
    expect(tiles[0]?.destination.query).toEqual({ clock: "sla-breached" });
  });
});
