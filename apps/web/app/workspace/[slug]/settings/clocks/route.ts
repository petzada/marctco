import {
  updateWorkspaceSettings,
  WorkspaceSettingsWriteError
} from "@marctco/db";
import { canManageSettings } from "../../../../../lib/settings-access";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

interface RouteContext {
  readonly params: Promise<{ slug: string }>;
}

function resultRedirect(slug: string, result: "saved" | "invalid" | "failed") {
  const parameter = result === "saved" ? "result" : "error";
  return new Response(null, {
    status: 303,
    headers: { location: `/workspace/${slug}/settings?${parameter}=${result}` }
  });
}

function integerField(form: FormData, name: string): number | null {
  const raw = form.get(name);
  if (typeof raw !== "string" || raw.trim() === "") return null;
  const value = Number(raw);
  return Number.isInteger(value) ? value : Number.NaN;
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
  const first_contact_sla_minutes = integerField(form, "first_contact_sla_minutes");
  const stagnation_days = integerField(form, "stagnation_days");
  if (
    first_contact_sla_minutes === null ||
    stagnation_days === null ||
    Number.isNaN(first_contact_sla_minutes) ||
    Number.isNaN(stagnation_days)
  ) {
    return resultRedirect(slug, "invalid");
  }

  try {
    await updateWorkspaceSettings(access.workspace.context, {
      first_contact_sla_minutes,
      stagnation_days
    });
    return resultRedirect(slug, "saved");
  } catch (error) {
    if (error instanceof WorkspaceSettingsWriteError && error.code === "FORBIDDEN") {
      return new Response(null, { status: 404 });
    }
    if (error instanceof WorkspaceSettingsWriteError && error.code === "INVALID") {
      return resultRedirect(slug, "invalid");
    }
    return resultRedirect(slug, "failed");
  }
}
