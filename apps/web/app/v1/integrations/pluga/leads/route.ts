import { recordIntegrationEvent, resolveWorkspaceByIntegrationToken } from "@marctco/db";
import { checkSuspiciousRequestLimit, createMemoryRateLimiter } from "@marctco/domain";
import { NextResponse } from "next/server";
import { bearerToken } from "../../../../../lib/integration-token";
import { logger } from "../../../../../lib/logger";
import { requestIp } from "../../../../../lib/request-ip";

export const dynamic = "force-dynamic";

const failedTokenLimiter = createMemoryRateLimiter({ limit: 60, window_ms: 60_000 });

/**
 * One POST per lead, answered 200 after the PostgreSQL commit — not 202,
 * because Pluga does not document which codes it treats as success, and a
 * client whose panel turns red on every delivered lead is the product looking
 * broken (ADR-0007). Duplicates are 200 too: idempotency has one owner, the
 * constraint, and never a pre-check in the request path.
 *
 * The handler is provider-agnostic on purpose: it does not know whether this
 * is Meta, Google or a landing page. That is what lets a corrected connector
 * reprocess the same stored payload later (ADR-0008).
 */
export async function POST(request: Request): Promise<NextResponse> {
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
    // The contract is validated here; the business is decided by the worker.
    // No field is required — only that the body parsed.
    return NextResponse.json({ status: "invalid_json" }, { status: 400 });
  }

  const { integration_event_id } = await recordIntegrationEvent({
    workspace_id: resolved.workspace_id,
    token,
    raw
  });

  // The queue is deliberately absent from this path: the dispatcher publishes
  // from the outbox, so Redis being down cannot cost a lead (ADR-0007).
  logger.info({
    event: "integration_event_received",
    result: "accepted",
    workspace_id: resolved.workspace_id,
    integration_event_id
  });
  return NextResponse.json({ status: "accepted" }, { status: 200 });
}

function unauthorized(request: Request, result: string): NextResponse {
  // The refusal reason travels in `result`, which telemetry already allows.
  // The caller never learns which of the two it was, and the log carries
  // neither the token nor the address — only the fact and the request id.
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
