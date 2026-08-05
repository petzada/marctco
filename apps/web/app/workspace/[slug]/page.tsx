import { resolveWorkspaceAccess } from "../../../lib/workspace-access";
import { workspaceRoleLabel } from "../../../lib/workspace-role";

export default async function WorkspacePage({
  params
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return null;
  }

  return (
    <main className="min-h-[100dvh] bg-canvas-sunken px-md py-xl">
      <section className="mx-auto max-w-7xl rounded-xl border border-hairline bg-canvas p-xl">
        <p className="text-eyebrow text-primary">{workspaceRoleLabel(access.workspace.role)}</p>
        <h1 className="mt-xs text-headline text-ink">{access.workspace.name}</h1>
        <p className="mt-sm text-body text-ink-secondary">A operação do workspace será exibida aqui.</p>
        <form action="/auth/logout" className="mt-xl" method="post">
          <button
            className="min-h-10 rounded-md border border-hairline-strong px-md text-button text-ink transition-[background-color,transform] duration-150 ease-out hover:bg-surface-inset active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-primary-focus"
            type="submit"
          >
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
