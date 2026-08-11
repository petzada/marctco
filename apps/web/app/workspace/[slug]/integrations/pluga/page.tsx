import {
  getIntegrationConnectionSummary,
  getLastSuccessfulSyncAt,
  listDeadLetterEvents,
  listIntegrationEvents,
  listQuarantinedEvents,
  type DeadLetterEventRecord,
  type IntegrationEventRecord,
  type IntegrationEventStatus,
  type QuarantinedEventSummary
} from "@marctco/db";
import { readLeadPayload } from "@marctco/domain";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import {
  DataTable,
  DataTableCell,
  DataTableHeaderCell,
  DataTableRow
} from "../../../../../components/ui/data-table";
import { EmptyState } from "../../../../../components/ui/empty-state";
import { StatusBadge, type StatusBadgeTone } from "../../../../../components/ui/status-badge";
import { isPayloadExpired } from "../../../../../lib/integration-payload-expiry";
import { canManageIntegrationSecret, canOpenPlugaScreen } from "../../../../../lib/pluga-access";
import { formatQuarantineWait } from "../../../../../lib/quarantine-wait-time";
import {
  metaHttpRequestTemplate,
  PLUGA_LEADS_ENDPOINT_PATH,
  pluginRequestHeaders
} from "../../../../../lib/pluga-templates";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";
import { CopyBlock } from "./copy-block";
import { PlugaSecretPanel } from "./pluga-secret-panel";

export const metadata: Metadata = {
  title: "Pluga | marctco",
  description: "Ligue a captação de leads via Pluga sem depender de suporte técnico"
};

const EVENT_STATUS_TONE: Readonly<Record<IntegrationEventStatus, StatusBadgeTone>> = {
  RECEIVED: "info",
  PROCESSED: "success",
  QUARANTINED: "warning",
  FAILED: "danger"
};

const EVENT_STATUS_LABEL: Readonly<Record<IntegrationEventStatus, string>> = {
  RECEIVED: "Recebido",
  PROCESSED: "Processado",
  QUARANTINED: "Em quarentena",
  FAILED: "Falhou"
};

const DATE_TIME = new Intl.DateTimeFormat("pt-BR", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export default async function PlugaIntegrationPage({
  params,
  searchParams
}: Readonly<{
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>) {
  const { slug } = await params;
  const query = await searchParams;
  const access = await resolveWorkspaceAccess(slug);
  if (access.status !== "resolved" || !canOpenPlugaScreen(access.workspace.role)) {
    notFound();
  }

  const isOwner = canManageIntegrationSecret(access.workspace.role);
  const [connection, events, lastSync, quarantine, deadLetter] = await Promise.all([
    isOwner
      ? getIntegrationConnectionSummary(access.workspace.context, "PLUGA")
      : Promise.resolve(null),
    listIntegrationEvents(access.workspace.context, { limit: 20 }),
    getLastSuccessfulSyncAt(access.workspace.context),
    listQuarantinedEvents(access.workspace.context, { limit: 20 }),
    listDeadLetterEvents(access.workspace.context, { limit: 20 })
  ]);

  const releasedId = firstParam(query.released);
  const reprocessedId = firstParam(query.reprocessed);
  const reprocessError = firstParam(query.reprocess_error);

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-xl md:px-lg md:py-xxl">
      <div className="mx-auto flex w-full max-w-content flex-col gap-lg">
        <header className="max-w-prose">
          <p className="text-eyebrow text-primary">Integração</p>
          <h1 className="mt-xs text-headline text-ink md:text-display-md">Pluga</h1>
          <p className="mt-sm text-body text-ink-secondary">
            Copie a URL, gere o segredo, cole na Pluga e dispare um lead de teste. O resultado
            aparece aqui, sem precisar chamar suporte.
          </p>
        </header>

        {releasedId ? (
          <FlashNotice tone="success">
            Lead liberado da quarentena — o card já está no funil.
          </FlashNotice>
        ) : null}
        {reprocessedId ? (
          <FlashNotice tone="success">Evento reenviado para a fila de processamento.</FlashNotice>
        ) : null}
        {reprocessError === "expired" ? (
          <FlashNotice tone="warning">
            O conteúdo desse evento já expirou (mais de 90 dias) e não pode ser reprocessado — só
            o registro de que ele chegou continua guardado.
          </FlashNotice>
        ) : null}
        {reprocessError === "unknown" ? (
          <FlashNotice tone="danger">Não foi possível reprocessar esse evento agora.</FlashNotice>
        ) : null}

        {isOwner ? (
          <PlugaSecretPanel
            connection={connection}
            endpointUrlHint={`POST https://SEU-CRM.example${PLUGA_LEADS_ENDPOINT_PATH}`}
            slug={slug}
          />
        ) : (
          <Card>
            <p className="text-body-sm text-ink-secondary">
              A URL e o segredo do webhook são administrados pela Direção. Fale com quem tem esse
              papel para gerar, rotacionar ou desativar a chave.
            </p>
          </Card>
        )}

        <DocumentationSection />

        <section className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center justify-between gap-sm">
            <h2 className="text-title text-ink">Histórico recente</h2>
            <p className="text-body-sm text-ink-muted">
              {lastSync
                ? `Última sincronização bem-sucedida: ${DATE_TIME.format(lastSync)}`
                : "Nenhuma sincronização bem-sucedida ainda."}
            </p>
          </div>
          {events.length === 0 ? (
            <EmptyState
              description="Assim que a Pluga enviar o primeiro lead de teste, ele aparece aqui."
              title="Nenhum evento recebido ainda"
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <DataTableHeaderCell>Data</DataTableHeaderCell>
                  <DataTableHeaderCell>Situação</DataTableHeaderCell>
                  <DataTableHeaderCell>Erro</DataTableHeaderCell>
                  <DataTableHeaderCell>Mapeamento</DataTableHeaderCell>
                  <DataTableHeaderCell>Conteúdo</DataTableHeaderCell>
                  <DataTableHeaderCell>Ação</DataTableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {events.map((event) => (
                  <EventRow event={event} key={event.id} slug={slug} />
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        <section className="flex flex-col gap-sm">
          <h2 className="text-title text-ink">Fila morta</h2>
          <p className="max-w-prose text-body-sm text-ink-secondary">
            Leads que o processamento tentou várias vezes e desistiu. O lead não se perdeu — ele
            continua guardado aqui, com o motivo da falha. Corrigido o que causou o erro, use
            &quot;Reprocessar&quot;: é o mesmo caminho que a recuperação automática usa, sem fila
            paralela.
          </p>
          {deadLetter.length === 0 ? (
            <EmptyState
              description="Nenhum lead recebido parou de ser tentado."
              title="Nada na fila morta"
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <DataTableHeaderCell>Falhou em</DataTableHeaderCell>
                  <DataTableHeaderCell>Recebido em</DataTableHeaderCell>
                  <DataTableHeaderCell>Motivo</DataTableHeaderCell>
                  <DataTableHeaderCell>Ação</DataTableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {deadLetter.map((event) => (
                  <DeadLetterRow event={event} key={event.id} slug={slug} />
                ))}
              </tbody>
            </DataTable>
          )}
        </section>

        <section className="flex flex-col gap-sm">
          <h2 className="text-title text-ink">Quarentena</h2>
          <p className="max-w-prose text-body-sm text-ink-secondary">
            Sem telefone e sem e-mail, o lead não vira Pessoa nem Oportunidade — não há como
            contatar nem identificar. Complete os dados lendo o payload cru e libere o card.
          </p>
          {quarantine.length === 0 ? (
            <EmptyState
              description="Todo lead recebido com telefone ou e-mail entra direto no funil."
              title="Nenhum lead em quarentena"
            />
          ) : (
            <DataTable>
              <thead>
                <tr>
                  <DataTableHeaderCell>Recebido em</DataTableHeaderCell>
                  <DataTableHeaderCell>Espera</DataTableHeaderCell>
                  <DataTableHeaderCell>Origem</DataTableHeaderCell>
                  <DataTableHeaderCell>Identificador</DataTableHeaderCell>
                  <DataTableHeaderCell>Ação</DataTableHeaderCell>
                </tr>
              </thead>
              <tbody>
                {quarantine.map((lead) => (
                  <QuarantineRow key={lead.integration_event_id} lead={lead} slug={slug} />
                ))}
              </tbody>
            </DataTable>
          )}
        </section>
      </div>
    </main>
  );
}

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function FlashNotice({
  tone,
  children
}: Readonly<{ tone: "success" | "warning" | "danger"; children: React.ReactNode }>) {
  const toneClass =
    tone === "success"
      ? "border-success bg-success-surface text-success-ink"
      : tone === "warning"
        ? "border-warning bg-warning-surface text-warning-ink"
        : "border-danger bg-danger-surface text-danger-ink";
  return <p className={`rounded-md border p-sm text-body-sm ${toneClass}`}>{children}</p>;
}

function EventRow({
  event,
  slug
}: Readonly<{ event: IntegrationEventRecord; slug: string }>) {
  const expired = isPayloadExpired(event.raw);
  const presence = expired ? null : fieldPresence(event.raw);
  const canReprocess = event.status !== "QUARANTINED";

  return (
    <DataTableRow>
      <DataTableCell>{DATE_TIME.format(event.received_at)}</DataTableCell>
      <DataTableCell>
        <StatusBadge dot tone={EVENT_STATUS_TONE[event.status]}>
          {EVENT_STATUS_LABEL[event.status]}
        </StatusBadge>
      </DataTableCell>
      <DataTableCell>
        {event.failure_reason ? (
          <span className="text-caption text-danger-ink" title={event.failure_reason}>
            {event.failure_reason}
          </span>
        ) : (
          <span className="text-caption text-ink-disabled">–</span>
        )}
      </DataTableCell>
      <DataTableCell>
        {presence ? (
          <span className="text-caption text-ink-muted">
            Nome {presence.name ? "✓" : "–"} · Telefone {presence.phone ? "✓" : "–"} · E-mail{" "}
            {presence.email ? "✓" : "–"}
          </span>
        ) : (
          <span className="text-caption text-ink-disabled">Conteúdo expirado</span>
        )}
      </DataTableCell>
      <DataTableCell>
        {expired ? (
          <span className="text-caption text-ink-muted">
            Expirou — só o registro de que chegou continua guardado.
          </span>
        ) : event.status === "QUARANTINED" ? (
          <Link
            className="text-body-sm text-primary underline underline-offset-4"
            href={`/workspace/${slug}/integrations/pluga/quarantine/${event.id}`}
          >
            Completar e liberar
          </Link>
        ) : (
          <span className="text-caption text-ink-muted">Guardado</span>
        )}
      </DataTableCell>
      <DataTableCell>
        {canReprocess && !expired ? (
          <form
            action={`/workspace/${slug}/integrations/pluga/events/${event.id}/reprocess`}
            method="post"
          >
            <Button size="md" type="submit" variant="tertiary">
              Reprocessar
            </Button>
          </form>
        ) : null}
      </DataTableCell>
    </DataTableRow>
  );
}

function DeadLetterRow({
  event,
  slug
}: Readonly<{ event: DeadLetterEventRecord; slug: string }>) {
  return (
    <DataTableRow>
      <DataTableCell>{DATE_TIME.format(event.failed_at)}</DataTableCell>
      <DataTableCell>{DATE_TIME.format(event.received_at)}</DataTableCell>
      <DataTableCell>
        <span className="text-caption text-danger-ink">{event.failure_reason}</span>
      </DataTableCell>
      <DataTableCell>
        {event.payload_present ? (
          <form
            action={`/workspace/${slug}/integrations/pluga/events/${event.id}/reprocess`}
            method="post"
          >
            <Button size="md" type="submit" variant="tertiary">
              Reprocessar
            </Button>
          </form>
        ) : (
          <span className="text-caption text-ink-muted">
            Conteúdo expirado — só o registro continua guardado.
          </span>
        )}
      </DataTableCell>
    </DataTableRow>
  );
}

function fieldPresence(raw: unknown): { name: boolean; phone: boolean; email: boolean } {
  const { fields } = readLeadPayload(raw);
  return {
    name: fields.name !== null,
    phone: fields.phones.length > 0,
    email: fields.emails.length > 0
  };
}

function QuarantineRow({
  lead,
  slug
}: Readonly<{ lead: QuarantinedEventSummary; slug: string }>) {
  return (
    <DataTableRow>
      <DataTableCell>{DATE_TIME.format(lead.received_at)}</DataTableCell>
      <DataTableCell>{formatQuarantineWait(lead.received_at)}</DataTableCell>
      <DataTableCell>{lead.source}</DataTableCell>
      <DataTableCell>
        <span className="font-mono text-mono text-ink-muted">{lead.external_lead_id}</span>
      </DataTableCell>
      <DataTableCell>
        <Link
          className="text-body-sm text-primary underline underline-offset-4"
          href={`/workspace/${slug}/integrations/pluga/quarantine/${lead.integration_event_id}`}
        >
          Completar e liberar
        </Link>
      </DataTableCell>
    </DataTableRow>
  );
}

function DocumentationSection() {
  return (
    <>
      <section className="rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
        <p className="inline-flex rounded-pill bg-warning-surface px-sm py-xs text-caption text-warning-ink">
          Aviso de plano
        </p>
        <h2 className="mt-sm text-title text-ink">HTTP Request exige plano pago da Pluga</h2>
        <p className="mt-sm max-w-prose text-body text-ink-secondary">
          O recurso que envia o lead da Pluga para o CRM (HTTP Request) só existe nos planos
          pagos da Pluga. Sem um deles contratado, a automação não tem como entregar o lead
          aqui — não há ingestão de anúncios sem esse plano.
        </p>
      </section>

      <section className="rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
        <h2 className="text-title text-ink">Formato esperado, em linguagem simples</h2>
        <p className="mt-sm max-w-prose text-body text-ink-secondary">
          A Pluga não tem um formato próprio: você monta o JSON que ela envia campo por campo, no
          editor da automação. O CRM entende um conjunto fixo de nomes — o contrato{" "}
          <code className="font-mono">v1</code> — e nenhum campo de negócio é obrigatório. Um
          lead sem telefone e sem e-mail ainda é guardado; ele só não vira card no funil sozinho.
        </p>
      </section>

      <section className="rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
        <h2 className="text-title text-ink">Modelo para Meta (Facebook/Instagram)</h2>
        <p className="mt-sm max-w-prose text-body text-ink-secondary">
          Na automação Facebook Lead Ads → HTTP Request da Pluga, use POST para a URL acima, os
          cabeçalhos abaixo e o corpo como modelo — troque cada <code>{"<< … >>"}</code> pelo
          campo que o editor da Pluga oferece para aquele gatilho.
        </p>
        <p className="mt-md text-label text-ink-secondary">Cabeçalhos</p>
        <CopyBlock code={pluginRequestHeaders} label="cabeçalhos" />
        <p className="mt-md text-label text-ink-secondary">Corpo da requisição</p>
        <CopyBlock code={metaHttpRequestTemplate} label="corpo" />
        <p className="mt-md max-w-prose text-body-sm text-ink-secondary">
          Nome, telefone e e-mail não aparecem na lista pública de campos da Pluga para este
          gatilho — o mais provável é que surjam no editor assim que você conectar sua conta e
          escolher o formulário real. Confirme isso no fluxo de teste abaixo antes de considerar
          a automação pronta.
        </p>
      </section>

      <section className="rounded-lg border border-hairline-strong bg-surface-inset p-lg md:p-xl">
        <p className="text-caption text-ink-muted">Google Ads</p>
        <h2 className="mt-xs text-title text-ink">Modelo aguardando teste em conta real</h2>
        <p className="mt-sm max-w-prose text-body text-ink-secondary">
          A lista pública da Pluga para o gatilho de formulário do Google Ads não é confiável —
          ela veio incompleta, sem campos de contato. Antes de publicar um modelo, alguém precisa
          conectar uma conta real, enviar um lead de teste e confirmar quais campos aparecem.
        </p>
      </section>

      <section className="rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
        <h2 className="text-title text-ink">Como testar cada automação</h2>
        <ol className="mt-sm max-w-prose list-decimal space-y-xs pl-lg text-body-sm text-ink-secondary">
          <li>Cole a URL e o segredo desta tela no destino HTTP Request da automação na Pluga.</li>
          <li>
            Na própria Pluga, use o recurso de enviar um dado de teste da automação (um lead real
            do formulário conectado).
          </li>
          <li>
            Volte a esta tela e confira, no histórico abaixo, se nome, telefone e e-mail aparecem
            marcados na coluna &quot;Mapeamento&quot;. Sem os três, a automação ainda não está
            pronta para receber leads de verdade.
          </li>
        </ol>
      </section>

      <section className="rounded-lg border border-hairline bg-canvas p-lg md:p-xl">
        <h2 className="text-title text-ink">Quanto tempo o conteúdo fica guardado</h2>
        <p className="mt-sm max-w-prose text-body text-ink-secondary">
          Depois de 90 dias, o conteúdo do lead (nome, telefone, respostas do formulário) deixa
          de ser guardado. O registro de que o lead chegou, quando e no que deu continua para
          sempre — só o conteúdo pessoal sai. Um evento em quarentena é a única exceção: ele não
          expira enquanto ninguém completar os dados e liberar o card.
        </p>
      </section>
    </>
  );
}
