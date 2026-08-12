import {
  createIntegrationConnection,
  getIntegrationConnectionSummary,
  rotateIntegrationConnectionSecret,
  setIntegrationConnectionStatus,
  type IntegrationConnectionStatus
} from "@marctco/db";
import { NextResponse } from "next/server";
import { canManageIntegrationSecret } from "./integration-access";
import type { IntegrationSurface } from "./integration-surfaces";
import { logger } from "./logger";
import { redirectTo } from "./redirect-response";
import { resolveWorkspaceAccess } from "./workspace-access";

const KNOWN_STATUSES: ReadonlySet<string> = new Set(["ACTIVE", "DISABLED"]);

interface RouteContext {
  readonly params: Promise<{ slug: string }>;
}

export type IntegrationRouteHandler = (
  request: Request,
  context: RouteContext
) => Promise<NextResponse>;

/**
 * The screen a `.../<segment>/status` route belongs to, read from the path the
 * request actually arrived on rather than from the surface.
 *
 * The surface is bound to the route by hand, one `export const POST` per file,
 * and nothing makes `surface.segment` agree with the directory the file sits
 * in. Building the redirect from the surface would turn that disagreement into
 * a silent bounce to a 404; building it from the mount point means the form
 * always returns to the screen that submitted it, even if the binding is
 * wrong. Only the path is used — the host on `request.url` is the internal
 * container behind Railway's edge, which is the whole subject of
 * `redirect-response.ts`.
 */
export function screenPathForStatusRoute(request_url: string): `/${string}` {
  const { pathname } = new URL(request_url);
  const screen = pathname.replace(/\/status\/?$/, "");
  return (screen === "" ? "/" : screen) as `/${string}`;
}

/**
 * Generates or rotates the bearer secret of one origin's connection.
 *
 * Route handlers and not Server Actions (ADR-0013): the tenant is structural,
 * from the `slug` segment, and the client panel calls this by `fetch` so the
 * cleartext token can be held in component state and shown once — never
 * round-tripped through a redirect or a URL, where it would end up in browser
 * history and server logs. The token is likewise absent from the log line.
 *
 * Built from a surface rather than written per screen: Pluga and landing page
 * need byte-identical behaviour on different providers, and the one time this
 * was written twice, the second copy never got written at all — the
 * landing-page screen documented a token no route could mint.
 *
 * Direção only (ADR-0015): this is the credential half of the screen.
 */
export function createIntegrationSecretHandler(
  surface: IntegrationSurface
): IntegrationRouteHandler {
  return async function POST(request, { params }) {
    const { slug } = await params;
    const access = await resolveWorkspaceAccess(slug);
    if (access.status === "unauthenticated") {
      return NextResponse.json({ status: "unauthenticated" }, { status: 401 });
    }
    if (access.status === "not-found" || !canManageIntegrationSecret(access.workspace.role)) {
      return NextResponse.json({ status: "forbidden" }, { status: 403 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ status: "invalid_json" }, { status: 400 });
    }
    const action =
      typeof body === "object" && body !== null && "action" in body ? body.action : null;

    if (action !== "generate" && action !== "rotate") {
      return NextResponse.json({ status: "unknown_action" }, { status: 400 });
    }

    if (action === "generate") {
      const existing = await getIntegrationConnectionSummary(
        access.workspace.context,
        surface.provider
      );
      if (existing) {
        // The screen's own state should have hidden "gerar" once a connection
        // exists; refusing here is the server not trusting that it did.
        return NextResponse.json({ status: "already_exists" }, { status: 409 });
      }
      const created = await createIntegrationConnection(access.workspace.context, {
        provider: surface.provider
      });
      logger.info({
        event: "integration_connection_secret",
        result: "generated",
        provider: surface.provider,
        workspace_id: access.workspace.workspace_id
      });
      return NextResponse.json({ token: created.token, token_last4: created.token_last4 });
    }

    const rotated = await rotateIntegrationConnectionSecret(
      access.workspace.context,
      surface.provider
    );
    logger.info({
      event: "integration_connection_secret",
      result: "rotated",
      provider: surface.provider,
      workspace_id: access.workspace.workspace_id
    });
    return NextResponse.json({ token: rotated.token, token_last4: rotated.token_last4 });
  };
}

/**
 * Enables or disables one origin's connection without deleting its
 * configuration. A plain form POST + redirect, like the rest of this app's
 * low-stakes writes (`Sair`, onboarding provisioning) — nothing here needs to
 * be shown once and held out of a redirect, unlike the secret itself.
 *
 * Every refusal returns to the screen instead of answering 403, because the
 * caller is a form and not `fetch`: a JSON body would replace the page with
 * raw text. A role that cannot open the screen at all lands on the same 404
 * the screen itself would have given it.
 *
 * Scoped to the surface's provider, so disabling the landing page cannot
 * silence Pluga.
 *
 * Direção only (ADR-0015).
 */
export function createIntegrationStatusHandler(
  surface: IntegrationSurface
): IntegrationRouteHandler {
  return async function POST(request, { params }) {
    const { slug } = await params;
    const back = screenPathForStatusRoute(request.url);
    const access = await resolveWorkspaceAccess(slug);
    if (access.status === "unauthenticated") {
      return redirectTo("/login");
    }
    if (access.status === "not-found" || !canManageIntegrationSecret(access.workspace.role)) {
      return redirectTo(back);
    }

    const form = await request.formData();
    const status = form.get("status");
    if (typeof status !== "string" || !KNOWN_STATUSES.has(status)) {
      return redirectTo(back);
    }

    await setIntegrationConnectionStatus(
      access.workspace.context,
      surface.provider,
      status as IntegrationConnectionStatus
    );
    logger.info({
      event: "integration_connection_status",
      result: status === "ACTIVE" ? "enabled" : "disabled",
      provider: surface.provider,
      workspace_id: access.workspace.workspace_id
    });
    return redirectTo(back);
  };
}
