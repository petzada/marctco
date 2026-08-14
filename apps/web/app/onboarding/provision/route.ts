import { listUserWorkspaces, provisionWorkspace } from "@marctco/db";
import { checkSuspiciousRequestLimit, createMemoryRateLimiter } from "@marctco/domain";
import type { NextResponse } from "next/server";
import { hashIdentifier } from "../../../lib/audit-hash";
import { logger } from "../../../lib/logger";
import { onboardingDecision } from "../../../lib/onboarding-decision";
import { provisioningEntitlement } from "../../../lib/provisioning-entitlement";
import { redirectTo } from "../../../lib/redirect-response";
import { requestIp } from "../../../lib/request-ip";
import { consumeProvisioningEntitlement } from "../../../lib/supabase/admin";
import { getAuthenticatedSession } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

const unentitledProvisioningLimiter = createMemoryRateLimiter({ limit: 20, window_ms: 60_000 });

/**
 * The write half of `/onboarding`, outside `/workspace/:slug` because there is
 * no slug to be under yet (ADR-0012). It is a route handler rather than a
 * Server Action so the write path stays explicit, like every other write in
 * the app (ADR-0013).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getAuthenticatedSession();
  if (!session) {
    return redirectTo("/login");
  }

  const workspaces = await listUserWorkspaces({ authenticated_user_id: session.user_id });
  const decision = onboardingDecision(provisioningEntitlement(session.claims), workspaces);
  if (decision.kind === "member") {
    return redirectTo("/access");
  }
  if (decision.kind === "denied") {
    // Sem direito e sem vínculo: a tela de erro terminal em /onboarding, nunca
    // um redirect mudo para o login (ADR-0021). A tentativa é auditada sem PII
    // e passa pelo mesmo limiter em memória das tentativas de workspace alheio
    // (ADR-0019 §4, ADR-0012).
    const limit = checkSuspiciousRequestLimit(unentitledProvisioningLimiter, {
      scope: "UNENTITLED_PROVISIONING_ATTEMPT",
      ip_address: requestIp(request.headers)
    });
    logger.warn({
      event: "workspace_provisioning",
      result: limit.allowed ? "denied" : "denied_rate_limited",
      user_id_hash: hashIdentifier(session.user_id),
      request_id: request.headers.get("x-request-id") ?? undefined
    });
    return redirectTo("/onboarding");
  }

  // Spending the right first is what makes it consumed by provisioning rather
  // than cleaned up after it. A right that survived a successful provisioning
  // is the ex-collaborator hole: membership removed later, stale claim still
  // in the token, brand-new workspace owned. If the workspace then fails to be
  // created, the marking has to be redone — the safe side of the trade. A JWT
  // that still looks marked after the first click must not provision again:
  // the live Auth user is already false, so this call returns false and the
  // function is not reached.
  let spent: boolean;
  try {
    spent = await consumeProvisioningEntitlement(session.user_id);
  } catch (error: unknown) {
    logger.error({
      event: "workspace_provisioning",
      result: "right_not_consumed",
      user_id_hash: hashIdentifier(session.user_id),
      error
    });
    return redirectTo("/onboarding?error=configuration");
  }
  if (!spent) {
    return redirectTo(workspaces.length > 0 ? "/access" : "/onboarding?error=configuration");
  }

  let provisioned;
  try {
    provisioned = await provisionWorkspace({
      owner_user_id: session.user_id,
      workspace_name: decision.workspace_name
    });
  } catch (error: unknown) {
    // The right is already spent, so this user cannot retry on their own: the
    // technical team has to mark them again. That only becomes visible if it
    // is said here, in the same audit stream as the refusals.
    logger.error({
      event: "workspace_provisioning",
      result: "right_spent_without_workspace",
      user_id_hash: hashIdentifier(session.user_id),
      error
    });
    throw error;
  }

  logger.info({
    event: "workspace_provisioning",
    result: "provisioned",
    user_id_hash: hashIdentifier(session.user_id),
    workspace_slug_hash: hashIdentifier(provisioned.slug)
  });
  return redirectTo(`/workspace/${provisioned.slug}`);
}
