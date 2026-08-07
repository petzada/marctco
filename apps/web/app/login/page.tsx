import { redirect } from "next/navigation";
import { getAuthenticatedUserId } from "../../lib/supabase/server";
import { EntryShell } from "../entry-shell";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const userId = await getAuthenticatedUserId();
  if (userId) {
    redirect("/access");
  }

  return (
    <EntryShell>
      <div className="mb-xl grid gap-xxs">
        <p className="text-eyebrow text-primary">marctco</p>
        <h1 className="text-title text-ink md:text-headline">Acesse sua operação</h1>
        <p className="text-body-sm text-ink-muted">
          Entre com o e-mail e a senha fornecidos pela sua assessoria.
        </p>
      </div>
      <LoginForm />
    </EntryShell>
  );
}
