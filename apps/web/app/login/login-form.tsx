"use client";

import { useState, type FormEvent } from "react";
import { createSupabaseBrowserClient } from "../../lib/supabase/client";
import { fieldClassName, primaryActionClassName } from "../entry-shell";

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
          className={fieldClassName}
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          inputMode="email"
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-invalid={error !== null}
          aria-describedby={error ? "login-error" : undefined}
          required
        />
      </div>
      <div className="grid gap-xs">
        <label className="text-label text-ink-secondary" htmlFor="password">
          Senha
        </label>
        <input
          className={fieldClassName}
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          aria-invalid={error !== null}
          aria-describedby={error ? "login-error" : undefined}
          required
        />
      </div>
      {/*
       * The message is announced, not just drawn: a screen reader user who
       * submits and hears nothing has no way to know the attempt failed.
       * `aria-live` sits on the wrapper so it is in the accessibility tree
       * before the text arrives — a live region mounted together with its
       * content is not announced.
       */}
      <div aria-live="polite" role="status">
        {error ? (
          <p className="text-caption text-danger-ink" id="login-error">
            {error}
          </p>
        ) : null}
      </div>
      <button className={primaryActionClassName} disabled={submitting} type="submit">
        {submitting ? "Entrando" : "Entrar"}
      </button>
    </form>
  );
}
