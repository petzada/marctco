import { describe, expect, it } from "vitest";
import { operationalDashboardTileDestination } from "@marctco/domain";
import { operationalDashboardHref } from "./hrefs";

const slug = "11111111-1111-4111-8111-111111111111";

describe("operationalDashboardHref", () => {
  it("puts the tile filter on the destination URL", () => {
    expect(operationalDashboardHref(slug, operationalDashboardTileDestination("sla_breached"))).toBe(
      `/workspace/${slug}/leads?clock=sla-breached`
    );
    expect(operationalDashboardHref(slug, operationalDashboardTileDestination("stagnant"))).toBe(
      `/workspace/${slug}/leads?clock=stagnant`
    );
    expect(operationalDashboardHref(slug, operationalDashboardTileDestination("unassigned"))).toBe(
      `/workspace/${slug}/leads?responsible=unassigned`
    );
    expect(
      operationalDashboardHref(slug, operationalDashboardTileDestination("overdue_activities"))
    ).toBe(`/workspace/${slug}/agenda?due=overdue`);
  });
});
