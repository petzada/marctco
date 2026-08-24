import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  LANDING_PAGE_SURFACE,
  PLUGA_SURFACE,
  WHATSMIAU_SURFACE,
  type IntegrationSurface
} from "./integration-surfaces";

/**
 * Every case below runs against both surfaces, so the landing-page connection
 * — the one that had no surface at all until ticket 18 — is proved rather than
 * presumed.
 */
const SURFACES: readonly IntegrationSurface[] = [PLUGA_SURFACE, LANDING_PAGE_SURFACE];

/** The roles ADR-0015 puts below Direção; none of them may touch a credential. */
const BELOW_DIRECAO = ["ATTENDANT", "SUPERVISOR", "MANAGER"] as const;

const mocks = vi.hoisted(() => ({
  resolveWorkspaceAccess: vi.fn(),
  createIntegrationConnection: vi.fn(),
  rotateIntegrationConnectionSecret: vi.fn(),
  setIntegrationConnectionStatus: vi.fn(),
  loggerInfo: vi.fn()
}));

vi.mock("./workspace-access", () => ({
  resolveWorkspaceAccess: mocks.resolveWorkspaceAccess
}));
vi.mock("@marctco/db", () => ({
  createIntegrationConnection: mocks.createIntegrationConnection,
  rotateIntegrationConnectionSecret: mocks.rotateIntegrationConnectionSecret,
  setIntegrationConnectionStatus: mocks.setIntegrationConnectionStatus,
  // Literals, not the constants below: this factory is hoisted above them.
  DUPLICATE_CONNECTION_NAME: "A connection with this name already exists",
  NO_SUCH_CONNECTION: "There is no such integration connection in this workspace"
}));
vi.mock("./logger", () => ({
  logger: { info: mocks.loggerInfo, error: vi.fn(), warn: vi.fn() }
}));

const { createIntegrationSecretHandler, createIntegrationStatusHandler, screenPathForStatusRoute } =
  await import("./integration-connection-routes");

/**
 * Spelled out rather than imported from `@marctco/db`, which this file mocks
 * wholesale — importing the real module here would defeat the mock.
 */
const DUPLICATE_CONNECTION_NAME = "A connection with this name already exists";
const NO_SUCH_CONNECTION = "There is no such integration connection in this workspace";

const SLUG = "9c096b1a-6bcc-44cc-bb00-22a72139b26d";
const CONNECTION_ID = "0f4b6d2a-1c3e-4f58-9a70-8d2e5b1c7a94";
const params = Promise.resolve({ slug: SLUG });

function accessAs(role: string) {
  return {
    status: "resolved",
    workspace: {
      workspace_id: "workspace-1",
      slug: SLUG,
      name: "Assessoria",
      role,
      context: { kind: "user", workspace_id: "workspace-1", user_id: "user-1", role }
    }
  };
}

function secretRequest(segment: string, body: unknown, raw?: string): Request {
  return new Request(
    `https://app.marctco.test/workspace/${SLUG}/integrations/${segment}/secret`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: raw ?? JSON.stringify(body)
    }
  );
}

/** Addressed at the segment the route is really mounted at, because `back` is read from it. */
function statusRequest(
  segment: string,
  status: string | null,
  integration_connection_id: string | null = CONNECTION_ID
): Request {
  const form = new FormData();
  if (status !== null) {
    form.set("status", status);
  }
  if (integration_connection_id !== null) {
    form.set("integration_connection_id", integration_connection_id);
  }
  return new Request(`https://app.marctco.test/workspace/${SLUG}/integrations/${segment}/status`, {
    method: "POST",
    body: form
  });
}

/** Next.js RSC rejects any function in the props of a `"use client"` island. */
function clientPropGraphHasFunctions(value: unknown): boolean {
  if (typeof value === "function") {
    return true;
  }
  if (Array.isArray(value)) {
    return value.some(clientPropGraphHasFunctions);
  }
  if (value !== null && typeof value === "object") {
    return Object.values(value).some(clientPropGraphHasFunctions);
  }
  return false;
}

describe("integration surfaces", () => {
  it("gives each surface its own provider and its own URL segment", () => {
    const providers = SURFACES.map((surface) => surface.provider);
    const segments = SURFACES.map((surface) => surface.segment);

    expect(new Set(providers).size).toBe(SURFACES.length);
    expect(new Set(segments).size).toBe(SURFACES.length);
    expect(LANDING_PAGE_SURFACE.provider).toBe("LANDING_PAGE");
    expect(PLUGA_SURFACE.provider).toBe("PLUGA");
    expect(WHATSMIAU_SURFACE.provider).toBe("WHATSMIAU");
    expect(WHATSMIAU_SURFACE.segment).toBe("whatsapp");
    expect(SURFACES.map((surface) => surface.segment)).not.toContain("whatsapp");
  });

  it("keeps Pluga JSON headers as a boolean flag, not a callback", () => {
    expect(PLUGA_SURFACE.offersJsonRequestHeaders).toBe(true);
    expect(LANDING_PAGE_SURFACE.offersJsonRequestHeaders).toBe(false);
  });

  it("serializes into a client island without functions (Next RSC)", () => {
    for (const surface of SURFACES) {
      expect(clientPropGraphHasFunctions(surface)).toBe(false);
      expect(() => JSON.stringify(surface)).not.toThrow();
    }

    const plugaPanelProps = {
      connection: { status: "ACTIVE" as const, token_last4: "9f3a" },
      slug: SLUG,
      surface: PLUGA_SURFACE,
      webhookUrl: "https://web.example/v1/integrations/pluga/leads"
    };
    expect(clientPropGraphHasFunctions(plugaPanelProps)).toBe(false);
    expect(() => JSON.stringify(plugaPanelProps)).not.toThrow();
  });
});

describe("screenPathForStatusRoute", () => {
  it("drops the trailing /status to name the screen that submitted the form", () => {
    expect(
      screenPathForStatusRoute(`https://app.marctco.test/workspace/${SLUG}/integrations/pluga/status`)
    ).toBe(`/workspace/${SLUG}/integrations/pluga`);
    expect(
      screenPathForStatusRoute(
        `https://app.marctco.test/workspace/${SLUG}/integrations/landing-page/status/`
      )
    ).toBe(`/workspace/${SLUG}/integrations/landing-page`);
  });

  it("ignores the host, which behind Railway's edge is the internal container", () => {
    expect(screenPathForStatusRoute("http://f59095ac8225:8080/workspace/w/integrations/x/status")).toBe(
      "/workspace/w/integrations/x"
    );
  });
});

describe.each(SURFACES)("POST .../integrations/$segment/secret", (surface: IntegrationSurface) => {
  const POST = createIntegrationSecretHandler(surface);
  const request = (body: unknown, raw?: string) => secretRequest(surface.segment, body, raw);

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("answers 401 when the session is not authenticated", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "unauthenticated" });

    const response = await POST(request({ action: "generate", name: "LP institucional" }), {
      params
    });

    expect(response.status).toBe(401);
    expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
  });

  it("refuses every role below Direção — the secret is account material (ADR-0015)", async () => {
    for (const role of BELOW_DIRECAO) {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs(role));

      const response = await POST(request({ action: "generate", name: "LP institucional" }), {
      params
    });

      expect(response.status).toBe(403);
    }
    expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
  });

  it("answers 403 for a workspace the session is not associated with", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "not-found" });

    const response = await POST(request({ action: "generate", name: "LP institucional" }), {
      params
    });

    expect(response.status).toBe(403);
  });

  it("answers 400 for a body that is not JSON and for an action it does not know", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

    const malformed = await POST(request(null, "not json"), { params });
    const unknown = await POST(request({ action: "delete" }), { params });

    expect(malformed.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
  });

  it("creates a named connection on this provider and returns the secret once", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    mocks.createIntegrationConnection.mockResolvedValue({
      integration_connection_id: "connection-1",
      token: "mtco_generated",
      token_last4: "ated"
    });

    const response = await POST(request({ action: "generate", name: "LP institucional" }), {
      params
    });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      integration_connection_id: "connection-1",
      token: "mtco_generated",
      token_last4: "ated"
    });
    expect(mocks.createIntegrationConnection).toHaveBeenCalledWith(
      accessAs("OWNER").workspace.context,
      { provider: surface.provider, name: "LP institucional" }
    );
  });

  it("refuses to generate without a name — the provider no longer names one row", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

    const absent = await POST(request({ action: "generate" }), { params });
    const blank = await POST(request({ action: "generate", name: "   " }), { params });

    expect(absent.status).toBe(400);
    expect(blank.status).toBe(400);
    expect(mocks.createIntegrationConnection).not.toHaveBeenCalled();
  });

  it("mints a second connection on the same provider — N per provider (ADR-0031)", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    mocks.createIntegrationConnection
      .mockResolvedValueOnce({
        integration_connection_id: "connection-1",
        token: "mtco_first",
        token_last4: "irst"
      })
      .mockResolvedValueOnce({
        integration_connection_id: "connection-2",
        token: "mtco_second",
        token_last4: "cond"
      });

    const first = await POST(request({ action: "generate", name: "LP ACR" }), { params });
    const second = await POST(request({ action: "generate", name: "LP REAL" }), { params });

    expect([first.status, second.status]).toEqual([200, 200]);
    await expect(second.json()).resolves.toMatchObject({
      integration_connection_id: "connection-2"
    });
  });

  it("answers 409 for a name this workspace already uses", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    mocks.createIntegrationConnection.mockRejectedValue(new Error(DUPLICATE_CONNECTION_NAME));

    const response = await POST(request({ action: "generate", name: "LP institucional" }), {
      params
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({ status: "duplicate_name" });
  });

  it("rotates the connection it was given, and never a whole provider", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    mocks.rotateIntegrationConnectionSecret.mockResolvedValue({
      integration_connection_id: CONNECTION_ID,
      token: "mtco_rotated",
      token_last4: "ated"
    });

    const response = await POST(
      request({ action: "rotate", integration_connection_id: CONNECTION_ID }),
      { params }
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      integration_connection_id: CONNECTION_ID,
      token: "mtco_rotated",
      token_last4: "ated"
    });
    expect(mocks.rotateIntegrationConnectionSecret).toHaveBeenCalledWith(
      accessAs("OWNER").workspace.context,
      CONNECTION_ID
    );
  });

  it("refuses to rotate without naming a connection", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

    const response = await POST(request({ action: "rotate" }), { params });

    expect(response.status).toBe(400);
    expect(mocks.rotateIntegrationConnectionSecret).not.toHaveBeenCalled();
  });

  it("answers 404 for a connection this workspace cannot see", async () => {
    // RLS already made another tenant id read as absent; 404 keeps it that way
    // instead of confirming the id exists somewhere else.
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    mocks.rotateIntegrationConnectionSecret.mockRejectedValue(new Error(NO_SUCH_CONNECTION));

    const response = await POST(
      request({ action: "rotate", integration_connection_id: CONNECTION_ID }),
      { params }
    );

    expect(response.status).toBe(404);
  });

  it("never puts the clear secret in the log line", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    mocks.createIntegrationConnection.mockResolvedValue({
      integration_connection_id: "connection-1",
      token: "mtco_generated",
      token_last4: "ated"
    });

    await POST(request({ action: "generate", name: "LP institucional" }), { params });

    expect(JSON.stringify(mocks.loggerInfo.mock.calls)).not.toContain("mtco_generated");
    expect(mocks.loggerInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        event: "integration_connection_secret",
        result: "generated",
        provider: surface.provider
      })
    );
  });
});

describe.each(SURFACES)("POST .../integrations/$segment/status", (surface: IntegrationSurface) => {
  const POST = createIntegrationStatusHandler(surface);
  const request = (status: string | null) => statusRequest(surface.segment, status);
  const back = `/workspace/${SLUG}/integrations/${surface.segment}`;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("sends an unauthenticated session to the login screen", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "unauthenticated" });

    const response = await POST(request("DISABLED"), { params });

    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("/login");
    expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
  });

  it("bounces every role below Direção back without touching the connection", async () => {
    // A redirect and not a 403: the caller is a form, so a JSON body would
    // replace the page with raw text. Atendente and Supervisor land on the
    // screen, which 404s them on its own.
    for (const role of BELOW_DIRECAO) {
      mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs(role));

      const response = await POST(request("DISABLED"), { params });

      expect(response.status).toBe(303);
      expect(response.headers.get("location")).toBe(back);
    }
    expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
  });

  it("bounces a workspace the session is not associated with", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue({ status: "not-found" });

    const response = await POST(request("DISABLED"), { params });

    expect(response.headers.get("location")).toBe(back);
    expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
  });

  it("ignores a status it does not know", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

    const absent = await POST(request(null), { params });
    const bogus = await POST(request("DELETED"), { params });

    expect(absent.headers.get("location")).toBe(back);
    expect(bogus.headers.get("location")).toBe(back);
    expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
  });

  it("bounces a form that names no connection instead of guessing one", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

    const response = await POST(statusRequest(surface.segment, "DISABLED", null), { params });

    expect(response.headers.get("location")).toBe(back);
    expect(mocks.setIntegrationConnectionStatus).not.toHaveBeenCalled();
  });

  it("disables and re-enables the connection it was given, back on its own screen", async () => {
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));

    const disabled = await POST(request("DISABLED"), { params });
    const enabled = await POST(request("ACTIVE"), { params });

    expect(disabled.headers.get("location")).toBe(back);
    expect(enabled.headers.get("location")).toBe(back);
    expect(mocks.setIntegrationConnectionStatus).toHaveBeenNthCalledWith(
      1,
      accessAs("OWNER").workspace.context,
      CONNECTION_ID,
      "DISABLED"
    );
    expect(mocks.setIntegrationConnectionStatus).toHaveBeenNthCalledWith(
      2,
      accessAs("OWNER").workspace.context,
      CONNECTION_ID,
      "ACTIVE"
    );
  });

  it("returns to the screen it is mounted at even if bound to the wrong surface", async () => {
    // Each route file binds its surface by hand, and nothing makes
    // `surface.segment` agree with the directory the file sits in. Reading the
    // redirect from the request path means a mis-binding cannot strand the
    // operator on a 404 — the form always comes back to the screen it left.
    mocks.resolveWorkspaceAccess.mockResolvedValue(accessAs("OWNER"));
    const other = surface === PLUGA_SURFACE ? LANDING_PAGE_SURFACE : PLUGA_SURFACE;

    const response = await POST(statusRequest(other.segment, "DISABLED"), { params });

    expect(response.headers.get("location")).toBe(
      `/workspace/${SLUG}/integrations/${other.segment}`
    );
  });
});
