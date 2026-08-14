import {
  attachWorkspaceMember,
  detachWorkspaceMember,
  listTeam,
  terminateWorkspaceMember,
  type CollaboratorRole
} from "@marctco/db";
import { normalizeEmail, normalizePhone } from "@marctco/domain";
import {
  createSupabaseAdminClient,
  revokeProvisioningEntitlement
} from "../../../../lib/supabase/admin";
import { logger } from "../../../../lib/logger";
import { canManageTeam, COLLABORATOR_ROLE_OPTIONS } from "../../../../lib/team-access";
import { resolveWorkspaceAccess } from "../../../../lib/workspace-access";

const AUTH_PAGE_SIZE = 1_000;
const ALLOWED_ROLES = new Set<CollaboratorRole>(
  COLLABORATOR_ROLE_OPTIONS.map(({ value }) => value)
);

interface RouteContext {
  readonly params: Promise<{ slug: string }>;
}

type AdminClient = ReturnType<typeof createSupabaseAdminClient>;

function resultRedirect(slug: string, result: "created" | "updated" | "detached" | "terminated" | "invalid" | "failed") {
  const parameter = result === "invalid" || result === "failed" ? "error" : "result";
  return new Response(null, {
    status: 303,
    headers: { location: `/workspace/${slug}/team?${parameter}=${result}` }
  });
}

function stringField(form: FormData, name: string): string {
  const value = form.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function tagsField(form: FormData): string[] {
  return stringField(form, "tags")
    .split(",")
    .map((tag) => tag.trim())
    .filter((tag) => tag !== "");
}

async function findAuthUserIdByEmail(admin: AdminClient, email: string): Promise<string | null> {
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error) {
      throw new Error(`Could not resolve collaborator login: ${error.message}`);
    }
    const match = data.users.find((user) => user.email?.toLowerCase() === email);
    if (match) {
      return match.id;
    }
    if (data.users.length < AUTH_PAGE_SIZE) {
      return null;
    }
  }
}

async function resolveOrInviteAuthUser(
  admin: AdminClient,
  email: string,
  display_name: string
): Promise<string> {
  const existing_user_id = await findAuthUserIdByEmail(admin, email);
  if (existing_user_id) {
    return existing_user_id;
  }

  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { display_name }
  });
  if (!error && data.user) {
    return data.user.id;
  }

  // Another request can create this login between listUsers and invite. In
  // that race, attaching the now-existing identity is the idempotent result.
  const raced_user_id = await findAuthUserIdByEmail(admin, email);
  if (raced_user_id) {
    return raced_user_id;
  }
  throw new Error(`Could not invite collaborator: ${error?.message ?? "missing Auth user"}`);
}

export async function POST(request: Request, { params }: RouteContext): Promise<Response> {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    return new Response(null, { status: 303, headers: { location: "/login" } });
  }
  if (access.status === "not-found") {
    return new Response(null, { status: 404 });
  }

  const form = await request.formData();
  const membership_action = stringField(form, "membership_action");
  if (membership_action === "detach" || membership_action === "terminate") {
    const target_user_id = stringField(form, "target_user_id");
    const can_detach = access.workspace.role === "MANAGER" || access.workspace.role === "OWNER";
    const can_terminate = access.workspace.role === "OWNER";
    if (!target_user_id || !can_detach || (membership_action === "terminate" && !can_terminate)) {
      return new Response(null, { status: 404 });
    }
    try {
      if (membership_action === "detach") {
        const result = await detachWorkspaceMember(access.workspace.context, target_user_id);
        if (!result.detached) return resultRedirect(slug, "failed");
        return resultRedirect(slug, "detached");
      }
      const target = (await listTeam(access.workspace.context)).find(
        (member) => member.user_id === target_user_id
      );
      if (!target || target.role === "OWNER" || target.user_id === access.workspace.context.user_id) {
        return resultRedirect(slug, "failed");
      }
      // Revoke first: if a tenant write fails, the member remains visible for
      // a safe retry and cannot retain a provisioning right in between.
      await revokeProvisioningEntitlement(target_user_id);
      const results = await terminateWorkspaceMember(access.workspace.context, target_user_id);
      if (results.length === 0) return resultRedirect(slug, "failed");
      return resultRedirect(slug, "terminated");
    } catch {
      logger.error({ event: `team_member_${membership_action}`, result: "failed" });
      return resultRedirect(slug, "failed");
    }
  }

  if (!canManageTeam(access.workspace.role)) {
    return new Response(null, { status: 404 });
  }

  const user_id_field = stringField(form, "user_id");
  const display_name = stringField(form, "display_name");
  const submitted_email = normalizeEmail(stringField(form, "email"));
  const submitted_phone = stringField(form, "whatsapp_phone");
  const whatsapp_phone = submitted_phone === "" ? null : normalizePhone(submitted_phone);
  const role = stringField(form, "role") as CollaboratorRole;
  if (
    !display_name ||
    !submitted_email ||
    !ALLOWED_ROLES.has(role) ||
    (submitted_phone !== "" && !whatsapp_phone)
  ) {
    return resultRedirect(slug, "invalid");
  }

  try {
    const current_member = user_id_field
      ? (await listTeam(access.workspace.context)).find((member) => member.user_id === user_id_field)
      : undefined;
    if (user_id_field && !current_member) {
      return resultRedirect(slug, "invalid");
    }
    const email = current_member?.email ?? submitted_email;
    if (!email) {
      return resultRedirect(slug, "invalid");
    }
    const user_id = current_member
      ? current_member.user_id
      : await resolveOrInviteAuthUser(createSupabaseAdminClient(), email, display_name);
    await attachWorkspaceMember(access.workspace.context, {
      user_id,
      display_name,
      email,
      role,
      tags: tagsField(form),
      whatsapp_phone
    });
    return resultRedirect(slug, user_id_field ? "updated" : "created");
  } catch {
    logger.error({ event: "team_member_save", result: "failed" });
    return resultRedirect(slug, "failed");
  }
}
