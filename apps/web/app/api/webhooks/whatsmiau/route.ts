import { NextResponse } from "next/server";
import {
  integrationTokenHashesEqual,
  hashIntegrationToken,
  recordWhatsAppInbound,
  resolveWorkspaceByIntegrationToken
} from "@marctco/db";
import { checkSuspiciousRequestLimit, createMemoryRateLimiter } from "@marctco/domain";
import { bearerToken } from "../../../../lib/integration-token";
import { logger } from "../../../../lib/logger";
import { requestIp } from "../../../../lib/request-ip";

export const dynamic = "force-dynamic";

const failedTokenLimiter = createMemoryRateLimiter({ limit: 60, window_ms: 60_000 });
const DUMMY_TOKEN_HASH = "0".repeat(64);

/**
 * WhatsMiau Cloud callback. Auth is the CRM-issued opaque Bearer compared
 * through the existing token-hash resolver — not an eighth private function.
 */
export async function POST(request: Request): Promise<NextResponse> {
  const token = bearerToken(request.headers);
  if (!token) {
    return unauthorized(request, "unauthorized_missing_token");
  }

  const presented_hash = hashIntegrationToken(token);
  const resolved = await resolveWorkspaceByIntegrationToken(token);
  if (!resolved) {
    integrationTokenHashesEqual(presented_hash, DUMMY_TOKEN_HASH);
    return unauthorized(request, "unauthorized_unknown_token");
  }

  let envelope: unknown;
  try {
    envelope = await request.json();
  } catch {
    logger.info({
      event: "whatsmiau_inbound",
      result: "invalid_json",
      workspace_id: resolved.workspace_id
    });
    return NextResponse.json({ status: "accepted" }, { status: 200 });
  }

  const outcome = await recordWhatsAppInbound({
    workspace_id: resolved.workspace_id,
    integration_connection_id: resolved.integration_connection_id,
    token,
    envelope
  });
  if (outcome.kind === "unauthorized") {
    return unauthorized(request, "unauthorized_inactive_connection");
  }

  logger.info({
    event: "whatsmiau_inbound",
    result: outcome.kind === "ignored" ? `ignored_${outcome.reason}` : outcome.kind,
    workspace_id: resolved.workspace_id
  });
  return NextResponse.json({ status: "accepted" }, { status: 200 });
}

export function OPTIONS(): NextResponse {
  return new NextResponse(null, {
    status: 405,
    headers: { allow: "POST" }
  });
}

function unauthorized(request: Request, result: string): NextResponse {
  const limit = checkSuspiciousRequestLimit(failedTokenLimiter, {
    scope: "AUTH_FAILURE",
    ip_address: requestIp(request.headers)
  });
  logger.warn({
    event: "whatsmiau_inbound",
    result: limit.allowed ? result : "unauthorized_rate_limited",
    request_id: request.headers.get("x-request-id") ?? undefined
  });
  return NextResponse.json({ status: "unauthorized" }, { status: 401 });
}
