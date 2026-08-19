import { updateWorkspaceSettings, WorkspaceSettingsWriteError } from "@marctco/db";
import { isFirstContactTrigger } from "@marctco/domain";
import { canManageSettings } from "../../../../../lib/settings-access";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

interface RouteContext {
  readonly params: Promise<{ slug: string }>;
}

function resultRedirect(slug: string, result: "first-contact" | "first-contact-invalid" | "first-contact-failed") {
  const parameter = result === "first-contact" ? "result" : "error";
  return new Response(null, {
    status: 303,
    headers: { location: `/workspace/${slug}/settings?${parameter}=${result}` }
  });
}

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    return new Response(null, { status: 303, headers: { location: "/login" } });
  }
  if (access.status === "not-found" || !canManageSettings(access.workspace.role)) {
    return new Response(null, { status: 404 });
  }

  const form = await request.formData();
  const trigger = form.get("first_contact_trigger");
  const template_body = form.get("first_contact_template_body");
  if (typeof trigger !== "string" || !isFirstContactTrigger(trigger) || typeof template_body !== "string") {
    return resultRedirect(slug, "first-contact-invalid");
  }

  try {
    await updateWorkspaceSettings(access.workspace.context, {
      first_contact_trigger: trigger,
      first_contact_template_body: template_body
    });
    return resultRedirect(slug, "first-contact");
  } catch (error) {
    if (error instanceof WorkspaceSettingsWriteError && error.code === "FORBIDDEN") {
      return new Response(null, { status: 404 });
    }
    if (error instanceof WorkspaceSettingsWriteError && error.code === "INVALID") {
      return resultRedirect(slug, "first-contact-invalid");
    }
    return resultRedirect(slug, "first-contact-failed");
  }
}
