import { setIntegrationConnectionStatus, type IntegrationConnectionStatus } from "@marctco/db";
import { logger } from "../../../../../../lib/logger";
import { canManageIntegrationSecret } from "../../../../../../lib/pluga-access";
import { redirectTo } from "../../../../../../lib/redirect-response";
import { resolveWorkspaceAccess } from "../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

const PROVIDER = "PLUGA";
const KNOWN_STATUSES: ReadonlySet<string> = new Set(["ACTIVE", "DISABLED"]);

/**
 * Enables or disables the connection without deleting its configuration. A
 * plain form POST + redirect, like the rest of this app's low-stakes writes
 * (`Sair`, onboarding provisioning) — nothing here needs to be shown once and
 * held out of a redirect, unlike the secret itself.
 *
 * Direção only (ADR-0015).
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const back = `/workspace/${slug}/integrations/pluga` as const;
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
    PROVIDER,
    status as IntegrationConnectionStatus
  );
  logger.info({
    event: "integration_connection_status",
    result: status === "ACTIVE" ? "enabled" : "disabled",
    workspace_id: access.workspace.workspace_id
  });
  return redirectTo(back);
}
