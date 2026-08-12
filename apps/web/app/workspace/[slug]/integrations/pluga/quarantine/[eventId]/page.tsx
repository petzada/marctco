import { getQuarantinedEvent } from "@marctco/db";
import { readLeadPayload } from "@marctco/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Card } from "../../../../../../../components/ui/card";
import { canOperateIntegrations } from "../../../../../../../lib/integration-access";
import { resolveWorkspaceAccess } from "../../../../../../../lib/workspace-access";
import { ReleaseForm } from "./release-form";

export const metadata: Metadata = {
  title: "Completar e liberar | marctco"
};

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export default async function QuarantinedLeadPage({
  params
}: Readonly<{ params: Promise<{ slug: string; eventId: string }> }>) {
  const { slug, eventId } = await params;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved" || !canOperateIntegrations(access.workspace.role)) {
    notFound();
  }

  let quarantined;
  try {
    quarantined = await getQuarantinedEvent(access.workspace.context, eventId);
  } catch {
    // Already released, superseded by a newer transmission, or never
    // existed in this workspace — all three read the same to the visitor.
    notFound();
  }

  const reading = readLeadPayload(quarantined.raw);

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-xl md:px-lg md:py-xxl">
      <div className="mx-auto flex w-full max-w-content flex-col gap-lg">
        <header className="max-w-prose">
          <Link
            className="text-body-sm text-primary underline underline-offset-4"
            href={`/workspace/${slug}/integrations/pluga`}
          >
            Voltar para Pluga
          </Link>
          <h1 className="mt-sm text-headline text-ink md:text-display-md">
            Completar e liberar
          </h1>
          <p className="mt-sm text-body text-ink-secondary">
            Este lead chegou em {DATE_TIME.format(quarantined.received_at)} sem telefone e sem
            e-mail — o mapeamento da Pluga não trouxe um jeito de falar com a pessoa. Leia o
            payload cru ao lado e digite o que você vê.
          </p>
        </header>

        <div className="grid gap-lg md:grid-cols-2">
          <Card>
            <h2 className="text-title text-ink">Payload recebido</h2>
            <p className="mt-xs text-body-sm text-ink-muted">
              Origem: {quarantined.source} · Identificador: {quarantined.external_lead_id}
            </p>
            <pre className="mt-md max-h-[32rem] overflow-auto rounded-lg border border-hairline bg-surface-inset p-md text-mono text-ink">
              <code>{JSON.stringify(quarantined.raw, null, 2)}</code>
            </pre>
          </Card>

          <Card>
            <h2 className="text-title text-ink">Completar dados</h2>
            <p className="mt-xs text-body-sm text-ink-secondary">
              Nenhum campo é obrigatório além do contato. Preencha o que estiver disponível no
              payload ao lado.
            </p>
            <div className="mt-md">
              <ReleaseForm eventId={eventId} initialName={reading.fields.name ?? ""} slug={slug} />
            </div>
          </Card>
        </div>
      </div>
    </main>
  );
}
