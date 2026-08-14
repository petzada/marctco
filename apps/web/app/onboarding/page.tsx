import { listUserWorkspaces } from "@marctco/db";
import { redirect } from "next/navigation";
import { onboardingDecision } from "../../lib/onboarding-decision";
import { provisioningEntitlement } from "../../lib/provisioning-entitlement";
import { getAuthenticatedSession } from "../../lib/supabase/server";
import { EntryShell, primaryActionClassName, secondaryActionClassName } from "../entry-shell";

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

  if (decision.kind === "denied") {
    return (
      <EntryShell>
        <h1 className="text-title text-ink md:text-headline">
          Sua conta não tem acesso a nenhum workspace
        </h1>
        <p className="mt-sm text-body text-ink-secondary">
          A Direção da sua empresa faz o cadastro.
        </p>
        <form action="/auth/logout" className="mt-xl" method="post">
          <button className={`${secondaryActionClassName} w-full`} type="submit">
            Sair
          </button>
        </form>
      </EntryShell>
    );
  }

  const parameters = await searchParams;

  return (
    <EntryShell>
      <h1 className="text-title text-ink md:text-headline">Vamos criar sua operação</h1>
      <p className="mt-sm text-body text-ink-secondary">
        A operação de <strong className="font-semibold text-ink">{decision.workspace_name}</strong>{" "}
        nasce com o funil comercial padrão, pronto para receber o primeiro lead.
      </p>
      <form className="mt-xl grid gap-lg" action="/onboarding/provision" method="post">
        {parameters.error === "configuration" ? (
          <p className="text-caption text-danger-ink" role="alert">
            Não foi possível criar agora. A equipe da marctco precisa concluir a configuração deste
            acesso.
          </p>
        ) : null}
        <button className={primaryActionClassName} type="submit">
          Criar workspace
        </button>
      </form>
    </EntryShell>
  );
}
