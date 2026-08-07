import { resolveWorkspaceAccess } from "../../../lib/workspace-access";
import { workspaceRoleLabel } from "../../../lib/workspace-role";
import { secondaryActionClassName } from "../../entry-shell";

export default async function WorkspacePage({
  params
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved") {
    return null;
  }

  return (
    <main className="min-h-[100dvh] bg-canvas-sunken px-md py-lg md:px-lg md:py-xl">
      {/*
       * `max-w-content` is DESIGN.md's 1280px content lock. It was written as
       * `max-w-7xl`, which the container-scale reset in globals.css now
       * refuses outright rather than resolving to a spacing step.
       */}
      <section className="mx-auto w-full max-w-content rounded-xl border border-hairline bg-canvas p-lg md:p-xl">
        <p className="text-eyebrow text-primary">{workspaceRoleLabel(access.workspace.role)}</p>
        <h1 className="mt-xxs text-title text-ink md:text-headline">{access.workspace.name}</h1>
        <p className="mt-sm text-body text-ink-secondary">
          A operação do workspace será exibida aqui.
        </p>
        <form action="/auth/logout" className="mt-xl" method="post">
          <button className={secondaryActionClassName} type="submit">
            Sair
          </button>
        </form>
      </section>
    </main>
  );
}
