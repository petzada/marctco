import { IntegrationEventPayloadExpiredError, requeueIntegrationEventForReprocessing } from "@marctco/db";
import { logger } from "../../../../../../../../lib/logger";
import { canOperateIntegrations } from "../../../../../../../../lib/integration-access";
import { redirectTo } from "../../../../../../../../lib/redirect-response";
import { resolveWorkspaceAccess } from "../../../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

/**
 * "Reprocessar": puts the event back in front of the same dispatcher
 * (ADR-0007), with no parallel path. Refuses — with an explanation the query
 * string carries back to the screen — when the payload already expired
 * (ADR-0014), instead of failing obscurely.
 *
 * Gestão and up (ADR-0015): operating the pipe, not owning the credential.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; eventId: string }> }
) {
  const { slug, eventId } = await params;
  const back = `/workspace/${slug}/integrations/pluga` as const;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    return redirectTo("/login");
  }
  if (access.status === "not-found" || !canOperateIntegrations(access.workspace.role)) {
    return redirectTo(back);
  }

  try {
    await requeueIntegrationEventForReprocessing(access.workspace.context, eventId);
  } catch (error: unknown) {
    if (error instanceof IntegrationEventPayloadExpiredError) {
      logger.warn({
        event: "integration_event_reprocess",
        result: "payload_expired",
        workspace_id: access.workspace.workspace_id,
        integration_event_id: eventId
      });
      return redirectTo(
        `${back}?reprocess_error=expired&event=${encodeURIComponent(eventId)}`
      );
    }
    logger.error({
      event: "integration_event_reprocess",
      result: "failed",
      workspace_id: access.workspace.workspace_id,
      integration_event_id: eventId,
      error
    });
    return redirectTo(`${back}?reprocess_error=unknown`);
  }

  logger.info({
    event: "integration_event_reprocess",
    result: "requeued",
    workspace_id: access.workspace.workspace_id,
    integration_event_id: eventId
  });
  return redirectTo(`${back}?reprocessed=${encodeURIComponent(eventId)}`);
}
