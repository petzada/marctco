import { cache } from "react";
import { createHash } from "node:crypto";
import { resolveUserContextForSlug, type ResolvedUserContext } from "@marctco/db";
import { checkSuspiciousRequestLimit, createMemoryRateLimiter } from "@marctco/domain";
import { headers } from "next/headers";
import { getAuthenticatedUserId } from "./supabase/server";
import { logger } from "./logger";

const foreignWorkspaceLimiter = createMemoryRateLimiter({ limit: 20, window_ms: 60_000 });
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function requestIp(requestHeaders: Headers): string {
  const forwarded = requestHeaders.get("x-forwarded-for");
  return forwarded?.split(",")[0]?.trim() || requestHeaders.get("x-real-ip") || "unknown";
}

export type WorkspaceAccessResult =
  | { readonly status: "unauthenticated" }
  | { readonly status: "not-found" }
  | { readonly status: "resolved"; readonly workspace: ResolvedUserContext };

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function denyWorkspaceAccess(
  authenticated_user_id: string,
  requested_slug: string
): Promise<WorkspaceAccessResult> {
  const requestHeaders = await headers();
  const decision = checkSuspiciousRequestLimit(foreignWorkspaceLimiter, {
    scope: "FOREIGN_WORKSPACE_ATTEMPT",
    ip_address: requestIp(requestHeaders)
  });
  logger.warn({
    event: "workspace_access",
    result: decision.allowed ? "denied" : "denied_rate_limited",
    user_id_hash: hashIdentifier(authenticated_user_id),
    workspace_slug_hash: hashIdentifier(requested_slug),
    request_id: requestHeaders.get("x-request-id") ?? undefined
  });
  return { status: "not-found" };
}

/**
 * The sole web-side bridge from authenticated Supabase identity and URL slug
 * to UserContext. `resolveUserContextForSlug` performs the membership check in
 * Postgres before any later data operation can open a GUC-scoped transaction.
 */
export const resolveWorkspaceAccess = cache(
  async (requested_slug: string): Promise<WorkspaceAccessResult> => {
    const authenticated_user_id = await getAuthenticatedUserId();
    if (!authenticated_user_id) {
      return { status: "unauthenticated" };
    }

    // The database resolver deliberately rejects invalid UUID input before a
    // query. At the HTTP boundary it must still be indistinguishable from an
    // unassociated or nonexistent workspace (ADR-0019): all three are 404.
    if (!UUID_PATTERN.test(requested_slug)) {
      return denyWorkspaceAccess(authenticated_user_id, requested_slug);
    }

    const workspace = await resolveUserContextForSlug(authenticated_user_id, requested_slug);
    if (workspace) {
      return { status: "resolved", workspace };
    }

    return denyWorkspaceAccess(authenticated_user_id, requested_slug);
  }
);
