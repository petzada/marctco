import { describe, expect, it } from "vitest";
import { operationalDashboardTileDestination } from "@marctco/domain";
import { dashboardLeadHref, operationalDashboardHref } from "./hrefs";

const slug = "11111111-1111-4111-8111-111111111111";
const opportunity_id = "22222222-2222-4222-8222-222222222222";

describe("dashboardLeadHref", () => {
  it("embeds the workspace slug from the current tenant, not a stored URL", () => {
    expect(dashboardLeadHref(slug, opportunity_id)).toBe(
      `/workspace/${slug}/leads/${opportunity_id}`
    );
    expect(
      dashboardLeadHref("aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", opportunity_id)
    ).toBe(`/workspace/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/leads/${opportunity_id}`);
  });
});

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
