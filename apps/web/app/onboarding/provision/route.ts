import { createHash } from "node:crypto";
import { listUserWorkspaces, provisionWorkspace } from "@marctco/db";
import { NextResponse } from "next/server";
import { logger } from "../../../lib/logger";
import { onboardingDecision } from "../../../lib/onboarding-decision";
import { provisioningEntitlement } from "../../../lib/provisioning-entitlement";
import {
  consumeProvisioningEntitlement,
  createSupabaseAdminClient
} from "../../../lib/supabase/admin";
import { getAuthenticatedSession } from "../../../lib/supabase/server";

export const dynamic = "force-dynamic";

function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The write half of `/onboarding`, outside `/workspace/:slug` because there is
 * no slug to be under yet (ADR-0012). It is a route handler rather than a
 * Server Action so the write path stays explicit, like every other write in
 * the app (ADR-0013).
 */
export async function POST(request: Request): Promise<NextResponse> {
  const session = await getAuthenticatedSession();
  if (!session) {
    return NextResponse.redirect(new URL("/login", request.url), { status: 303 });
  }

  const workspaces = await listUserWorkspaces({ authenticated_user_id: session.user_id });
  const decision = onboardingDecision(provisioningEntitlement(session.claims), workspaces);
  if (decision.kind === "member") {
    return NextResponse.redirect(new URL("/access", request.url), { status: 303 });
  }
  if (decision.kind === "wait") {
    // Um login sem associação e sem o direito não cria nada. A tentativa é
    // auditada sem PII: identificador em hash, nunca e-mail ou nome.
    logger.warn({
      event: "workspace_provisioning",
      result: "denied",
      user_id_hash: hashIdentifier(session.user_id),
      request_id: request.headers.get("x-request-id") ?? undefined
    });
    return NextResponse.redirect(new URL("/onboarding", request.url), { status: 303 });
  }

  const form = await request.formData();
  const submitted = form.get("workspace_name");
  const workspace_name = (
    typeof submitted === "string" && submitted.trim() !== ""
      ? submitted
      : (decision.workspace_name ?? "")
  ).trim();
  if (workspace_name === "") {
    return NextResponse.redirect(new URL("/onboarding?erro=nome", request.url), { status: 303 });
  }

  // Fail closed before creating anything: a workspace born while the right
  // cannot be spent would leave that right usable forever.
  try {
    createSupabaseAdminClient();
  } catch (error: unknown) {
    logger.error({
      event: "workspace_provisioning",
      result: "service_role_unavailable",
      user_id_hash: hashIdentifier(session.user_id),
      error
    });
    return NextResponse.redirect(new URL("/onboarding?erro=configuracao", request.url), {
      status: 303
    });
  }

  const provisioned = await provisionWorkspace({
    owner_user_id: session.user_id,
    workspace_name
  });

  try {
    await consumeProvisioningEntitlement(session.user_id);
  } catch (error: unknown) {
    // The workspace already exists and the database refuses a second one for
    // this owner, so the stale claim cannot be spent — but it must be cleared
    // by hand, and that only shows up if it is logged loudly here.
    logger.error({
      event: "workspace_provisioning",
      result: "right_not_consumed",
      user_id_hash: hashIdentifier(session.user_id),
      error
    });
  }

  logger.info({
    event: "workspace_provisioning",
    result: "provisioned",
    user_id_hash: hashIdentifier(session.user_id),
    workspace_slug_hash: hashIdentifier(provisioned.slug)
  });
  return NextResponse.redirect(new URL(`/workspace/${provisioned.slug}`, request.url), {
    status: 303
  });
}
