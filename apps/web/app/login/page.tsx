import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "../../lib/supabase/server";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const userId = await getAuthenticatedUserId();
  if (userId) {
    redirect("/access");
  }

  return (
    <main className="flex min-h-[100dvh] items-center bg-canvas-sunken px-md py-xxl">
      <section className="mx-auto w-full max-w-md rounded-xl border border-hairline bg-canvas p-xl">
        <div className="mb-xl grid gap-xs">
          <p className="text-eyebrow text-primary">marctco</p>
          <h1 className="text-headline text-ink">Acesse sua operação</h1>
          <p className="text-body-sm text-ink-muted">Entre com o e-mail e a senha fornecidos pela sua assessoria.</p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
