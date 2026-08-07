import type { PrismaClient } from "@prisma/client";
import {
  createUserContextFromResolvedMembership,
  type UserContext,
  type WorkspaceRole
} from "./access-context.js";
import { createPrismaClient } from "./client.js";
import { assertUuid } from "./internal/uuid.js";

const sharedPrisma = createPrismaClient();

interface WorkspaceContextRow {
  workspace_id: string;
  workspace_slug: string;
  workspace_name: string;
  workspace_role: WorkspaceRole;
}

export interface ResolveUserWorkspacesInput {
  readonly authenticated_user_id: string;
  readonly requested_slug?: string;
}

export interface UserWorkspace {
  readonly workspace_id: string;
  readonly slug: string;
  readonly name: string;
  readonly role: WorkspaceRole;
}

export interface ResolvedUserContext extends UserWorkspace {
  readonly context: UserContext;
}

function toUserWorkspace(
  row: WorkspaceContextRow,
): UserWorkspace {
  return {
    workspace_id: row.workspace_id,
    slug: row.workspace_slug,
    name: row.workspace_name,
    role: row.workspace_role
  };
}

/**
 * Resolves every WorkspaceMember for the authenticated user, optionally
 * constrained to the UUIDv4 slug from the current URL. This is the sole
 * producer of UserContext: the database function performs the membership
 * check before any request can set `app.workspace_id`.
 */
export async function listUserWorkspaces(
  input: ResolveUserWorkspacesInput,
  prisma: PrismaClient = sharedPrisma
): Promise<UserWorkspace[]> {
  assertUuid(input.authenticated_user_id, "authenticated_user_id");
  if (input.requested_slug !== undefined) {
    assertUuid(input.requested_slug, "requested_slug");
  }

  const rows = await prisma.$queryRaw<WorkspaceContextRow[]>`
    SELECT workspace_id, workspace_slug, workspace_name, workspace_role
    FROM private.resolve_user_workspaces(
      ${input.authenticated_user_id}::uuid,
      ${input.requested_slug ?? null}::uuid
    )
  `;
  return rows.map(toUserWorkspace);
}

/**
 * The sole producer of UserContext in packages/db. The supplied slug is only
 * a lookup key: the private function returns a row exclusively when it is a
 * WorkspaceMember association of the server-authenticated user.
 */
export async function resolveUserContextForSlug(
  authenticated_user_id: string,
  slug: string,
  prisma: PrismaClient = sharedPrisma
): Promise<ResolvedUserContext | null> {
  const workspaces = await listUserWorkspaces(
    { authenticated_user_id, requested_slug: slug },
    prisma
  );
  const workspace = workspaces[0];
  if (!workspace) {
    return null;
  }
  return {
    ...workspace,
    context: createUserContextFromResolvedMembership({
      workspace_id: workspace.workspace_id,
      user_id: authenticated_user_id,
      role: workspace.role
    })
  };
}
