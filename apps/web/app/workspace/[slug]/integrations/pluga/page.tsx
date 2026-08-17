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
import { headers } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";
import { IntegrationSecretNotice } from "../../../../../components/integrations/integration-secret-notice";
import { IntegrationSecretPanel } from "../../../../../components/integrations/integration-secret-panel";
import { PlugaMetaOnboarding } from "../../../../../components/integrations/pluga-meta-onboarding";
import { Button } from "../../../../../components/ui/button";
import {
  DataTable,
  DataTableCell,
  DataTableHeaderCell,
  DataTableRow
} from "../../../../../components/ui/data-table";
import { EmptyState } from "../../../../../components/ui/empty-state";
import { StatusBadge, type StatusBadgeTone } from "../../../../../components/ui/status-badge";
import { isPayloadExpired } from "../../../../../lib/integration-payload-expiry";
import {
  canManageIntegrationSecret,
  canOpenIntegrationScreen
} from "../../../../../lib/integration-access";
import { PLUGA_SURFACE } from "../../../../../lib/integration-surfaces";
import { formatQuarantineWait } from "../../../../../lib/quarantine-wait-time";
import { pluginRequestHeadersFor, PLUGA_LEADS_ENDPOINT_PATH } from "../../../../../lib/pluga-templates";
import { publicIntegrationUrl } from "../../../../../lib/public-origin";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";

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
  const [access, requestHeaders] = await Promise.all([resolveWorkspaceAccess(slug), headers()]);
  if (access.status !== "resolved" || !canOpenIntegrationScreen(access.workspace.role)) {
    notFound();
  }
  const webhookUrl = publicIntegrationUrl(requestHeaders, PLUGA_LEADS_ENDPOINT_PATH);

  const isOwner = canManageIntegrationSecret(access.workspace.role);
  const [connection, events, lastSync, quarantine, deadLetter] = await Promise.all([
    isOwner
      ? getIntegrationConnectionSummary(access.workspace.context, PLUGA_SURFACE.provider)
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
            Siga o passo a passo com os mesmos nomes da Pluga, cole URL e segredo, dispare um
            lead de teste. O resultado aparece no histórico abaixo.
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
          <IntegrationSecretPanel
            connection={connection}
            headersJsonForToken={pluginRequestHeadersFor}
            slug={slug}
            surface={PLUGA_SURFACE}
            webhookUrl={webhookUrl}
          />
        ) : (
          <IntegrationSecretNotice />
        )}

        <PlugaMetaOnboarding webhookUrl={webhookUrl} />

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
