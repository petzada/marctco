import { listUserWorkspaces } from "@marctco/db";
import { redirect } from "next/navigation";
import { onboardingDecision } from "../../lib/onboarding-decision";
import { provisioningEntitlement } from "../../lib/provisioning-entitlement";
import { getAuthenticatedSession } from "../../lib/supabase/server";

export const dynamic = "force-dynamic";

interface OnboardingPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export default async function OnboardingPage({ searchParams }: OnboardingPageProps) {
  const session = await getAuthenticatedSession();
  if (!session) {
    redirect("/login");
  }

  const workspaces = await listUserWorkspaces({ authenticated_user_id: session.user_id });
  const decision = onboardingDecision(provisioningEntitlement(session.claims), workspaces);
  if (decision.kind === "member") {
    redirect("/access");
  }

  if (decision.kind === "wait") {
    return (
      <main className="flex min-h-[100dvh] items-center bg-canvas-sunken px-md py-xxl">
        <section className="mx-auto w-full max-w-xl rounded-xl border border-hairline bg-canvas p-xl">
          <h1 className="text-headline text-ink">Seu acesso está sendo preparado</h1>
          <p className="mt-sm text-body text-ink-secondary">
            Você ainda não está associado a um workspace. Assim que a equipe da marctco liberar seu
            acesso, ele aparecerá aqui.
          </p>
        </section>
      </main>
    );
  }

  const parameters = await searchParams;
  const refusal = parameters.erro;

  return (
    <main className="flex min-h-[100dvh] items-center bg-canvas-sunken px-md py-xxl">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-hairline bg-canvas p-xl">
        <h1 className="text-headline text-ink">Vamos criar sua operação</h1>
        <p className="mt-sm text-body text-ink-secondary">
          Damos o nome da assessoria e preparamos o funil comercial padrão, pronto para receber o
          primeiro lead.
        </p>
        <form className="mt-xl grid gap-lg" action="/onboarding/provision" method="post">
          <div className="grid gap-xs">
            <label className="text-label text-ink-secondary" htmlFor="workspace_name">
              Nome da assessoria
            </label>
            <input
              className="min-h-10 rounded-md border border-hairline bg-canvas px-sm text-body text-ink outline-none placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary-focus"
              id="workspace_name"
              name="workspace_name"
              type="text"
              autoComplete="organization"
              defaultValue={decision.workspace_name ?? ""}
              maxLength={120}
              required
            />
          </div>
          {refusal === "nome" ? (
            <p className="text-caption text-danger-ink">Informe o nome da assessoria.</p>
          ) : null}
          {refusal === "configuracao" ? (
            <p className="text-caption text-danger-ink">
              Não foi possível criar agora. A equipe da marctco precisa concluir a configuração
              deste acesso.
            </p>
          ) : null}
          <button
            className="min-h-10 rounded-md bg-primary px-md text-button text-on-primary transition-[background-color,transform] duration-150 ease-out hover:bg-primary-hover active:scale-[0.98]"
            type="submit"
          >
            Criar workspace
          </button>
        </form>
      </section>
    </main>
  );
}
