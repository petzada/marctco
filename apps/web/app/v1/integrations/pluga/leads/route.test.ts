import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const resolveWorkspaceByIntegrationToken = vi.fn();
const recordIntegrationEvent = vi.fn();

vi.mock("@marctco/db", () => ({
  resolveWorkspaceByIntegrationToken,
  recordIntegrationEvent
}));

const { POST } = await import("./route");

const workspace_id = randomUUID();
const integration_event_id = randomUUID();

function leadRequest(init: { token?: string; body?: string } = {}): Request {
  const headers = new Headers({ "content-type": "application/json" });
  if (init.token !== undefined) {
    headers.set("authorization", `Bearer ${init.token}`);
  }
  return new Request("https://app.marctco.test/v1/integrations/pluga/leads", {
    method: "POST",
    headers,
    body: init.body ?? JSON.stringify({ nome: "Fulano", telefone: "11999998888" })
  });
}

describe("POST /v1/integrations/pluga/leads", () => {
  beforeEach(() => {
    resolveWorkspaceByIntegrationToken.mockReset().mockResolvedValue({ workspace_id });
    recordIntegrationEvent.mockReset().mockResolvedValue({ integration_event_id });
  });

  it("answers 200 with an accepted body once the payload is committed", async () => {
    const response = await POST(leadRequest({ token: "mtco_valid" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "accepted" });
    expect(recordIntegrationEvent).toHaveBeenCalledWith({
      workspace_id,
      token: "mtco_valid",
      raw: { nome: "Fulano", telefone: "11999998888" }
    });
  });

  it("takes the tenant from the token and ignores a workspace_id in the body", async () => {
    const foreign_workspace_id = randomUUID();
    await POST(
      leadRequest({
        token: "mtco_valid",
        body: JSON.stringify({ workspace_id: foreign_workspace_id, nome: "Fulano" })
      })
    );

    const [call] = recordIntegrationEvent.mock.calls as [[{ workspace_id: string }]];
    expect(call[0].workspace_id).toBe(workspace_id);
  });

  it("accepts any JSON body, with no business field required", async () => {
    const response = await POST(leadRequest({ token: "mtco_valid", body: "{}" }));

    expect(response.status).toBe(200);
    expect(recordIntegrationEvent).toHaveBeenCalledWith(
      expect.objectContaining({ raw: {} })
    );
  });

  it("answers 401 for an unknown or missing token, without recording anything", async () => {
    resolveWorkspaceByIntegrationToken.mockResolvedValue(null);
    const unknown = await POST(leadRequest({ token: "mtco_unknown" }));
    expect(unknown.status).toBe(401);

    const missing = await POST(leadRequest());
    expect(missing.status).toBe(401);
    expect(resolveWorkspaceByIntegrationToken).toHaveBeenCalledTimes(1);
    expect(recordIntegrationEvent).not.toHaveBeenCalled();
  });

  it("answers 400 when the body is not JSON", async () => {
    const response = await POST(leadRequest({ token: "mtco_valid", body: "não é json" }));

    expect(response.status).toBe(400);
    expect(recordIntegrationEvent).not.toHaveBeenCalled();
  });

  it("resolves the token before reading the body, so an unknown token never persists", async () => {
    const order: string[] = [];
    resolveWorkspaceByIntegrationToken.mockImplementation(() => {
      order.push("resolve");
      return Promise.resolve({ workspace_id });
    });
    recordIntegrationEvent.mockImplementation(() => {
      order.push("record");
      return Promise.resolve({ integration_event_id });
    });

    await POST(leadRequest({ token: "mtco_valid" }));

    expect(order).toEqual(["resolve", "record"]);
  });
});
