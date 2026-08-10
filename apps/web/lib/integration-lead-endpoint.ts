import { recordIntegrationEvent, resolveWorkspaceByIntegrationToken } from "@marctco/db";
import { checkSuspiciousRequestLimit, createMemoryRateLimiter } from "@marctco/domain";
import { NextResponse } from "next/server";
import { bearerToken } from "./integration-token";
import { logger } from "./logger";
import { requestIp } from "./request-ip";

const failedTokenLimiter = createMemoryRateLimiter({ limit: 60, window_ms: 60_000 });

/**
 * The shared durable HTTP boundary for Pluga and landing-page connections.
 * It deliberately knows neither provider nor lead source: the token selects
 * the IntegrationConnection, and the worker interprets the committed event.
 */
export async function acceptIntegrationLead(request: Request): Promise<NextResponse> {
  const token = bearerToken(request.headers);
  if (!token) {
    return unauthorized(request, "unauthorized_missing_token");
  }

  const resolved = await resolveWorkspaceByIntegrationToken(token);
  if (!resolved) {
    return unauthorized(request, "unauthorized_unknown_token");
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_json" }, { status: 400 });
  }

  const { integration_event_id } = await recordIntegrationEvent({
    workspace_id: resolved.workspace_id,
    token,
    raw
  });

  logger.info({
    event: "integration_event_received",
    result: "accepted",
    workspace_id: resolved.workspace_id,
    integration_event_id
  });
  return NextResponse.json({ status: "accepted" }, { status: 200 });
}

function unauthorized(request: Request, result: string): NextResponse {
  const limit = checkSuspiciousRequestLimit(failedTokenLimiter, {
    scope: "AUTH_FAILURE",
    ip_address: requestIp(request.headers)
  });
  logger.warn({
    event: "integration_event_received",
    result: limit.allowed ? result : "unauthorized_rate_limited",
    request_id: request.headers.get("x-request-id") ?? undefined
  });
  return NextResponse.json({ status: "unauthorized" }, { status: 401 });
}
