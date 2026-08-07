import { listUserWorkspaces } from "@marctco/db";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "../../lib/supabase/server";
import { workspaceEntryDestination } from "../../lib/workspace-entry";
import { workspaceRoleLabel } from "../../lib/workspace-role";
import { EntryShell } from "../entry-shell";

export default async function AccessPage() {
  const authenticated_user_id = await getAuthenticatedUserId();
  if (!authenticated_user_id) {
    redirect("/login");
  }

  const workspaces = await listUserWorkspaces({ authenticated_user_id });
  const destination = workspaceEntryDestination(workspaces);
  if (destination.kind === "onboarding") {
    redirect("/onboarding");
  }
  if (destination.kind === "workspace") {
    redirect(`/workspace/${destination.slug}`);
  }

  return (
    <EntryShell>
      <h1 className="text-title text-ink md:text-headline">Escolha um workspace</h1>
      <p className="mt-xxs text-body-sm text-ink-muted">
        Abra a operação que deseja consultar nesta aba.
      </p>
      {/* `grid-cols-1`, not bare `grid`: an implicit column is sized `auto`,
          so a long operation name would widen the track and push the row past
          the panel instead of truncating inside it. */}
      <ul className="mt-xl grid grid-cols-1 gap-xs">
        {workspaces.map((workspace) => (
          <li key={workspace.workspace_id}>
            {/*
             * DESIGN.md "Touch Targets": rows hold 48px on pointer and grow
             * to 56px on touch. `min-w-0` on the name is what lets a long
             * operation name truncate instead of shoving the role label off
             * the panel on a narrow phone.
             */}
            <a
              className="flex min-h-12 items-center justify-between gap-sm rounded-lg border border-hairline px-md py-xs text-body-strong text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-surface-inset active:scale-[0.98] pointer-coarse:min-h-14 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary-focus"
              href={`/workspace/${workspace.slug}`}
            >
              <span className="min-w-0 truncate">{workspace.name}</span>
              <span className="shrink-0 text-caption text-ink-muted">
                {workspaceRoleLabel(workspace.role)}
              </span>
            </a>
          </li>
        ))}
      </ul>
    </EntryShell>
  );
}
