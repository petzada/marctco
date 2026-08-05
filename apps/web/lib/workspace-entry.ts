import type { UserWorkspace } from "@marctco/db";

export type WorkspaceEntryDestination =
  | { readonly kind: "onboarding" }
  | { readonly kind: "workspace"; readonly slug: string }
  | { readonly kind: "selector" };

/**
 * Chooses the authenticated user's first destination without storing an
 * active workspace in the session. The caller always redirects by URL, so
 * each browser tab keeps the workspace explicit in its own path (ADR-0012).
 */
export function workspaceEntryDestination(
  workspaces: readonly UserWorkspace[]
): WorkspaceEntryDestination {
  if (workspaces.length === 0) {
    return { kind: "onboarding" };
  }

  if (workspaces.length === 1) {
    const workspace = workspaces[0];
    if (!workspace) {
      throw new Error("A single workspace entry must have a workspace");
    }
    return { kind: "workspace", slug: workspace.slug };
  }

  return { kind: "selector" };
}
