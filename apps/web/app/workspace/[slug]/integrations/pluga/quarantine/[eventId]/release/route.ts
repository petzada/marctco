import { NextResponse } from "next/server";
import type { QuarantineCompletionInput } from "../../../../../../../../lib/build-release-inbound-lead";
import { logger } from "../../../../../../../../lib/logger";
import { canOperateIntegrations } from "../../../../../../../../lib/integration-access";
import { canReleaseQuarantinedLead } from "../../../../../../../../lib/quarantine-release-eligibility";
import { releaseQuarantinedLead } from "../../../../../../../../lib/release-quarantined-lead";
import { resolveWorkspaceAccess } from "../../../../../../../../lib/workspace-access";

export const dynamic = "force-dynamic";

/**
 * "Completar e liberar". The whole sequence — `getQuarantinedEvent` →
 * `recordLeadSubmission` → `findPersonCandidates`/`decidePersonIdentity` →
 * `resolveIntakeDestination` + `findOpenOpportunitiesOfPerson` →
 * `decideIntake` → `applyIntakePlan` — lives in
 * `apps/web/lib/release-quarantined-lead.ts`, called here with `now` set to
 * this request's instant: the release, not the original receipt (ADR-0007
 * §Quarentena, ADR-0017).
 *
 * JSON in, JSON out rather than a redirect: the manager needs to see, without
 * a full navigation, whether the release actually produced a card or stayed
 * in quarantine because the two fields were still empty.
 *
 * Gestão and up (ADR-0015) — quarantine is an operational action, not a
 * credential one.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string; eventId: string }> }
): Promise<NextResponse> {
  const { slug, eventId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    return NextResponse.json({ status: "unauthenticated" }, { status: 401 });
  }
  if (access.status === "not-found" || !canOperateIntegrations(access.workspace.role)) {
    return NextResponse.json({ status: "forbidden" }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ status: "invalid_json" }, { status: 400 });
  }
  const completion = parseCompletion(body);
  if (!completion) {
    return NextResponse.json({ status: "invalid_body" }, { status: 400 });
  }
  if (!canReleaseQuarantinedLead({ phone: completion.phone, email: completion.email })) {
    // Belt and suspenders: the button is disabled client-side for the same
    // reason, but the server is the one place this rule is allowed to be the
    // final word (ADR-0007 §Identidade — sair da quarentena exige ao menos
    // um contato).
    return NextResponse.json(
      { status: "no_contact", message: "Informe ao menos um telefone ou e-mail para liberar este lead." },
      { status: 422 }
    );
  }

  try {
    const applied = await releaseQuarantinedLead(
      access.workspace.context,
      { integration_event_id: eventId, completion },
      new Date()
    );
    logger.info({
      event: "quarantine_release",
      result: applied.kind === "QUARANTINE" ? "still_quarantined" : "released",
      workspace_id: access.workspace.workspace_id,
      integration_event_id: eventId
    });
    return NextResponse.json({ status: "ok", kind: applied.kind });
  } catch (error: unknown) {
    logger.error({
      event: "quarantine_release",
      result: "failed",
      workspace_id: access.workspace.workspace_id,
      integration_event_id: eventId,
      error
    });
    return NextResponse.json({ status: "error" }, { status: 500 });
  }
}

function parseCompletion(body: unknown): QuarantineCompletionInput | null {
  if (typeof body !== "object" || body === null) {
    return null;
  }
  const record = body as Record<string, unknown>;
  return {
    name: typeof record.name === "string" ? record.name : "",
    phone: typeof record.phone === "string" ? record.phone : "",
    email: typeof record.email === "string" ? record.email : "",
    cpf: typeof record.cpf === "string" ? record.cpf : ""
  };
}
