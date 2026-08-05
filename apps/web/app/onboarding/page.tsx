import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "../../lib/supabase/server";

export default async function OnboardingPage() {
  const userId = await getAuthenticatedUserId();
  if (!userId) {
    redirect("/login");
  }

  return (
    <main className="flex min-h-[100dvh] items-center bg-canvas-sunken px-md py-xxl">
      <section className="mx-auto w-full max-w-xl rounded-xl border border-hairline bg-canvas p-xl">
        <h1 className="text-headline text-ink">Seu acesso está sendo preparado</h1>
        <p className="mt-sm text-body text-ink-secondary">
          Você ainda não está associado a um workspace. O próximo passo de configuração será exibido aqui.
        </p>
      </section>
    </main>
  );
}
