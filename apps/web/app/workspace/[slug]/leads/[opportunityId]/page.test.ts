import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getLead = vi.fn();
const listLeadActivities = vi.fn();
const listTeam = vi.fn();
const getWorkspaceSettings = vi.fn();
const resolveWorkspaceAccess = vi.fn();

vi.mock("@marctco/db", () => ({ getLead, listLeadActivities, listTeam, getWorkspaceSettings }));
vi.mock("next/navigation", () => ({ notFound: vi.fn() }));
vi.mock("next/link", () => ({ default: (props: { href: string; children: unknown }) => props.children }));
vi.mock("../../../../../lib/workspace-access", () => ({ resolveWorkspaceAccess }));

const LeadCardPage = (await import("./page")).default;
const slug = randomUUID();
const opportunityId = randomUUID();
const userId = randomUUID();
const workspaceId = randomUUID();

function context(role: "ATTENDANT" | "SUPERVISOR" | "MANAGER") {
  return { kind: "user", workspace_id: workspaceId, user_id: userId, role };
}

describe("Lead card page", () => {
  beforeEach(() => {
    getLead.mockReset().mockResolvedValue({
      opportunity_id: opportunityId,
      reviews: [],
      arrived_at: new Date("2026-08-17T12:00:00.000Z"),
      first_contact_at: null,
      status: "OPEN",
      missing_phone: false
    });
    listLeadActivities.mockReset().mockResolvedValue([]);
    listTeam.mockReset().mockResolvedValue([]);
    getWorkspaceSettings.mockReset().mockResolvedValue({
      first_contact_sla_minutes: 120,
      stagnation_days: 7
    });
    resolveWorkspaceAccess.mockReset();
  });

  it("reads the lead and its activities through named operations, without listing Equipe for an Attendant", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      status: "resolved",
      workspace: { role: "ATTENDANT", context: context("ATTENDANT") }
    });
    await LeadCardPage({ params: Promise.resolve({ slug, opportunityId }) });
    expect(getLead).toHaveBeenCalledOnce();
    expect(listLeadActivities).toHaveBeenCalledWith(context("ATTENDANT"), opportunityId);
    expect(listTeam).not.toHaveBeenCalled();
  });

  it("loads Equipe assignees for Gestão so the card does not assemble a where", async () => {
    resolveWorkspaceAccess.mockResolvedValue({
      status: "resolved",
      workspace: { role: "MANAGER", context: context("MANAGER") }
    });
    await LeadCardPage({ params: Promise.resolve({ slug, opportunityId }) });
    expect(listTeam).toHaveBeenCalledWith(context("MANAGER"));
    expect(listLeadActivities).toHaveBeenCalledOnce();
  });
});
