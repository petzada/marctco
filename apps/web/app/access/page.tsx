import { listUserWorkspaces } from "@marctco/db";
import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "../../lib/supabase/server";
import { workspaceEntryDestination } from "../../lib/workspace-entry";
import { workspaceRoleLabel } from "../../lib/workspace-role";

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
    <main className="flex min-h-[100dvh] items-center bg-canvas-sunken px-md py-xxl">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-hairline bg-canvas p-xl">
        <h1 className="text-headline text-ink">Escolha um workspace</h1>
        <p className="mt-xs text-body-sm text-ink-muted">Abra a operação que deseja consultar nesta aba.</p>
        <ul className="mt-xl grid gap-sm">
          {workspaces.map((workspace) => (
            <li key={workspace.workspace_id}>
              <a
                className="flex min-h-11 items-center justify-between rounded-lg border border-hairline px-md text-body-strong text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-surface-inset active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-focus"
                href={`/workspace/${workspace.slug}`}
              >
                <span>{workspace.name}</span>
                <span className="text-caption text-ink-muted">{workspaceRoleLabel(workspace.role)}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>
    </main>
  );
}
