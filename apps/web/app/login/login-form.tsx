"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";

export function LoginForm() {
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const email = form.get("email");
    const password = form.get("password");
    if (typeof email !== "string" || typeof password !== "string") {
      setError("Informe seu e-mail e senha.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
    if (signInError) {
      setError("Não foi possível entrar. Verifique suas credenciais.");
      setSubmitting(false);
      return;
    }
    window.location.assign("/access");
  }

  return (
    <form
      className="grid gap-lg"
      onSubmit={(event) => {
        void onSubmit(event);
      }}
      noValidate
    >
      <div className="grid gap-xs">
        <label className="text-label text-ink-secondary" htmlFor="email">
          E-mail
        </label>
        <input
          className="min-h-10 rounded-md border border-hairline bg-canvas px-sm text-body text-ink outline-none placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary-focus"
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          required
        />
      </div>
      <div className="grid gap-xs">
        <label className="text-label text-ink-secondary" htmlFor="password">
          Senha
        </label>
        <input
          className="min-h-10 rounded-md border border-hairline bg-canvas px-sm text-body text-ink outline-none placeholder:text-ink-muted focus:border-primary focus:ring-2 focus:ring-primary-focus"
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      {error ? <p className="text-caption text-danger-ink">{error}</p> : null}
      <button
        className="min-h-10 rounded-md bg-primary px-md text-button text-on-primary transition-[background-color,transform] duration-150 ease-out hover:bg-primary-hover active:scale-[0.98] disabled:bg-ink-disabled"
        disabled={submitting}
        type="submit"
      >
        {submitting ? "Entrando" : "Entrar"}
      </button>
    </form>
  );
}
