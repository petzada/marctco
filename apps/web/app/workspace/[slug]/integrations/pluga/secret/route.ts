import {
  createIntegrationConnection,
  getIntegrationConnectionSummary,
  rotateIntegrationConnectionSecret
} from "@marctco/db";
import { NextResponse } from "next/server";
import { logger } from "../../../../../../lib/logger";
import { canManageIntegrationSecret } from "../../../../../../lib/pluga-access";
import { resolveWorkspaceAccess } from "../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

const PROVIDER = "PLUGA";

/**
 * Generates or rotates the Pluga secret. A route handler and not a Server
 * Action (ADR-0013): the tenant is structural, from the `slug` segment, and
 * the client-side panel calls this by `fetch` so the cleartext token can be
 * held in component state and shown once — never round-tripped through a
 * redirect or a URL, where it would end up in browser history and server
 * logs.
 *
 * Direção only (ADR-0015): this is the credential half of the screen.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
): Promise<NextResponse> {
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
  const action = typeof body === "object" && body !== null && "action" in body ? body.action : null;

  if (action !== "generate" && action !== "rotate") {
    return NextResponse.json({ status: "unknown_action" }, { status: 400 });
  }

  if (action === "generate") {
    const existing = await getIntegrationConnectionSummary(access.workspace.context, PROVIDER);
    if (existing) {
      // The screen's own state should have hidden "gerar" once a connection
      // exists; refusing here is the server not trusting that it did.
      return NextResponse.json({ status: "already_exists" }, { status: 409 });
    }
    const created = await createIntegrationConnection(access.workspace.context, {
      provider: PROVIDER
    });
    logger.info({
      event: "integration_connection_secret",
      result: "generated",
      workspace_id: access.workspace.workspace_id
    });
    return NextResponse.json({ token: created.token, token_last4: created.token_last4 });
  }

  const rotated = await rotateIntegrationConnectionSecret(access.workspace.context, PROVIDER);
  logger.info({
    event: "integration_connection_secret",
    result: "rotated",
    workspace_id: access.workspace.workspace_id
  });
  return NextResponse.json({ token: rotated.token, token_last4: rotated.token_last4 });
}
