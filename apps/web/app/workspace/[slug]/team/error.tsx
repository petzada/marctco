"use client";

import { Button } from "../../../../components/ui/button";

export default function TeamError({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  return (
    <main className="mx-auto max-w-content-wide p-md sm:p-lg">
      <section className="rounded-lg border border-danger bg-canvas p-lg" role="alert">
        <h1 className="text-title text-ink">Não foi possível carregar a Equipe</h1>
        <p className="mt-xs text-body-sm text-ink-muted">Tente novamente. Se o problema continuar, fale com o suporte.</p>
        <Button className="mt-lg" onClick={reset} variant="primary">Tentar novamente</Button>
      </section>
    </main>
  );
}
