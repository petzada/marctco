import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveWorkspaceByIntegrationToken = vi.fn();
const recordIntegrationEvent = vi.fn();

vi.mock("@marctco/db", () => ({
  resolveWorkspaceByIntegrationToken,
  recordIntegrationEvent
}));

const { OPTIONS, POST } = await import("./route");

const workspace_id = randomUUID();
const integration_event_id = randomUUID();

function landingPageRequest(init: { token?: string; body?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.token !== undefined) {
    headers.set("authorization", `Bearer ${init.token}`);
  }
  return new Request("https://app.marctco.test/v1/integrations/webhooks/leads", {
    method: "POST",
    headers,
    body: init.body ?? JSON.stringify({ name: "Maria Souza", phone: "11999998888" })
  });
}

describe("POST /v1/integrations/webhooks/leads", () => {
  beforeEach(() => {
    resolveWorkspaceByIntegrationToken.mockReset().mockResolvedValue({ workspace_id });
    recordIntegrationEvent.mockReset().mockResolvedValue({ integration_event_id });
  });

  it("commits a landing-page payload under the tenant resolved from its token", async () => {
    const claimedWorkspaceId = randomUUID();
    const response = await POST(
      landingPageRequest({
        token: "mtco_landing_page",
        body: JSON.stringify({
          workspace_id: claimedWorkspaceId,
          source: "LANDING_PAGE",
          external_lead_id: "form-1042",
          name: "Maria Souza"
        })
      })
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(recordIntegrationEvent).toHaveBeenCalledWith({
      workspace_id,
      token: "mtco_landing_page",
      raw: {
        workspace_id: claimedWorkspaceId,
        source: "LANDING_PAGE",
        external_lead_id: "form-1042",
        name: "Maria Souza"
      }
    });
  });

  it("keeps the same 401 and 400 contract as the Pluga endpoint", async () => {
    resolveWorkspaceByIntegrationToken.mockResolvedValue(null);
    const unauthorized = await POST(landingPageRequest({ token: "mtco_unknown" }));
    expect(unauthorized.status).toBe(401);

    resolveWorkspaceByIntegrationToken.mockResolvedValue({ workspace_id });
    const invalidJson = await POST(
      landingPageRequest({ token: "mtco_landing_page", body: "not json" })
    );
    expect(invalidJson.status).toBe(400);
  });

  it("does not enable browser CORS", () => {
    const preflight = OPTIONS();

    expect(preflight.status).toBe(405);
    expect(preflight.headers.get("allow")).toBe("POST");
    expect(preflight.headers.has("access-control-allow-origin")).toBe(false);
  });
});
