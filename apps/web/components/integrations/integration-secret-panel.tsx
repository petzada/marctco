"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { IntegrationSurface } from "../../lib/integration-surfaces";
import { maskIntegrationSecret } from "../../lib/mask-integration-secret";
import { pluginRequestHeadersFor } from "../../lib/pluga-templates";
import { Button } from "../ui/button";
import { Card } from "../ui/card";
import { FieldError, FieldLabel, TextInput } from "../ui/field";
import { Modal } from "../ui/modal";
import { StatusBadge } from "../ui/status-badge";
import { CopyBlock } from "./copy-block";

export interface IntegrationConnectionSummaryProps {
  readonly integration_connection_id: string;
  /** Named by the client, because the provider no longer identifies one row. */
  readonly name: string;
  readonly status: "ACTIVE" | "DISABLED";
  readonly token_last4: string;
}

export interface IntegrationSecretPanelProps {
  readonly slug: string;
  /** Decides which provider the routes below act on, and the wording around them. */
  readonly surface: IntegrationSurface;
  readonly connections: readonly IntegrationConnectionSummaryProps[];
  /** Absolute URL the operator pastes into the origin. No HTTP method prefix. */
  readonly webhookUrl: string;
}

type PendingAction = { readonly kind: "generate" } | { readonly kind: "rotate"; readonly id: string };
type ConfirmKind =
  | { readonly kind: "rotate"; readonly connection: IntegrationConnectionSummaryProps }
  | { readonly kind: "disable"; readonly connection: IntegrationConnectionSummaryProps }
  | null;

interface Revealed {
  readonly integration_connection_id: string;
  readonly name: string;
  readonly token: string;
}

/**
 * The Direção-only half of an integration screen (ADR-0015): webhook URL, the
 * connections that authenticate against it, and secret generation, rotation
 * and enable/disable per connection. A client island because a generated
 * secret must be shown exactly once, in memory, never round-tripped through a
 * redirect or a URL where it would land in browser history or server logs.
 *
 * A **list**, not one connection, since ADR-0031: a workspace can hold several
 * landing pages or several Pluga accounts, each with its own name, secret and
 * target funnel. The name is what the operator recognises here — the provider
 * is the same on every row.
 *
 * Every write names the connection it acts on. That is not cosmetic: while a
 * provider identified exactly one row, rotating "the Pluga secret" was
 * unambiguous; with several it would silence an arbitrary one.
 *
 * One component for every origin, parameterised by `surface`. JSON headers for
 * Pluga are formatted here, not passed in as a callback: a function prop from
 * the server page 500s the whole screen (digest 2350742981).
 */
export function IntegrationSecretPanel({
  slug,
  surface,
  connections,
  webhookUrl
}: IntegrationSecretPanelProps) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<Revealed | null>(null);
  const [pending, setPending] = useState<PendingAction | null>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [nameError, setNameError] = useState<string | null>(null);

  const basePath = `/workspace/${slug}/integrations/${surface.segment}`;
  const busy = pending !== null;

  async function post(body: Record<string, string>): Promise<Response> {
    return fetch(`${basePath}/secret`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
  }

  async function generate(): Promise<void> {
    const name = newName.trim();
    if (name === "") {
      setNameError("Dê um nome para reconhecer esta conexão depois.");
      return;
    }
    setPending({ kind: "generate" });
    setError(null);
    setNameError(null);
    try {
      const response = await post({ action: "generate", name });
      if (response.status === 409) {
        setNameError("Já existe uma conexão com esse nome neste workspace.");
        return;
      }
      if (!response.ok) {
        setError("Não foi possível gerar o segredo agora. Tente novamente.");
        return;
      }
      const created = (await response.json()) as {
        integration_connection_id: string;
        token: string;
      };
      setRevealed({ ...created, name });
      setNewName("");
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  async function rotate(connection: IntegrationConnectionSummaryProps): Promise<void> {
    setPending({ kind: "rotate", id: connection.integration_connection_id });
    setError(null);
    try {
      const response = await post({
        action: "rotate",
        integration_connection_id: connection.integration_connection_id
      });
      if (!response.ok) {
        setError("Não foi possível rotacionar o segredo agora. Tente novamente.");
        return;
      }
      const rotated = (await response.json()) as { token: string };
      setRevealed({
        integration_connection_id: connection.integration_connection_id,
        name: connection.name,
        token: rotated.token
      });
      setConfirm(null);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="flex flex-col gap-md">
      <div>
        <h2 className="text-title text-ink">Segredo e conexões</h2>
        <p className="mt-xs text-body-sm text-ink-secondary">{surface.copy.panelDescription}</p>
      </div>

      <div>
        <p className="text-label text-ink-secondary">{surface.copy.urlFieldLabel}</p>
        <CopyBlock className="mt-xs" code={webhookUrl} label="URL" />
        <p className="mt-xs text-caption text-ink-secondary">
          A URL é a mesma para todas as conexões. É o segredo que diz de qual delas o lead
          veio.
        </p>
        {webhookUrl.startsWith("http") ? null : (
          <p className="mt-xs text-caption text-warning-ink">
            O domínio público não veio nesta sessão. Complete a URL com o endereço deste CRM
            antes de colar.
          </p>
        )}
      </div>

      {revealed ? (
        <div className="rounded-md border border-warning bg-warning-surface p-md">
          <p className="text-body-strong text-warning-ink">
            Copie o segredo de “{revealed.name}” agora. Ele só aparece esta vez
          </p>
          <p className="mt-xs text-body-sm text-warning-ink">
            Depois de sair desta página, só o final do segredo fica visível. Se perder este
            valor, gere um novo.
          </p>
          <CopyBlock className="mt-sm" code={revealed.token} label="segredo" />
          {surface.offersJsonRequestHeaders ? (
            <div className="mt-md">
              <p className="text-label text-warning-ink">Cabeçalhos (JSON)</p>
              <p className="mt-xxs text-caption text-warning-ink">
                Este é o bloco que a Pluga pede no campo Cabeçalhos. O token já está dentro.
              </p>
              <CopyBlock
                className="mt-xs"
                code={pluginRequestHeadersFor(revealed.token)}
                label="cabeçalhos"
              />
            </div>
          ) : null}
        </div>
      ) : null}

      {error ? <p className="text-caption text-danger-ink">{error}</p> : null}

      {connections.length > 0 ? (
        <ul className="flex flex-col gap-sm">
          {connections.map((connection) => (
            <li
              className="flex flex-col gap-sm rounded-md border border-hairline p-md"
              key={connection.integration_connection_id}
            >
              <div className="flex flex-wrap items-center gap-sm">
                <span className="text-body-strong text-ink">{connection.name}</span>
                <StatusBadge dot tone={connection.status === "ACTIVE" ? "success" : "neutral"}>
                  {connection.status === "ACTIVE" ? "Ativa" : "Desativada"}
                </StatusBadge>
                <span className="font-mono text-mono text-ink-secondary">
                  {maskIntegrationSecret(connection.token_last4)}
                </span>
              </div>

              <div className="flex flex-wrap gap-sm">
                <Button
                  disabled={busy}
                  type="button"
                  variant="secondary"
                  onClick={() => {
                    setConfirm({ kind: "rotate", connection });
                  }}
                >
                  Rotacionar segredo
                </Button>
                {connection.status === "ACTIVE" ? (
                  <Button
                    disabled={busy}
                    type="button"
                    variant="tertiary"
                    onClick={() => {
                      setConfirm({ kind: "disable", connection });
                    }}
                  >
                    {surface.copy.disableButton}
                  </Button>
                ) : (
                  <form action={`${basePath}/status`} method="post">
                    <input
                      name="integration_connection_id"
                      type="hidden"
                      value={connection.integration_connection_id}
                    />
                    <input name="status" type="hidden" value="ACTIVE" />
                    <Button type="submit" variant="secondary">
                      {surface.copy.enableButton}
                    </Button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body-sm text-ink-secondary">
          Nenhuma conexão ainda. Crie a primeira abaixo.
        </p>
      )}

      <div className="flex flex-col gap-sm border-t border-hairline pt-md">
        <div>
          <FieldLabel htmlFor="new-connection-name" required>
            Nome da nova conexão
          </FieldLabel>
          <TextInput
            disabled={busy}
            id="new-connection-name"
            invalid={nameError !== null}
            maxLength={80}
            placeholder={surface.copy.newConnectionPlaceholder}
            value={newName}
            onChange={(event) => {
              setNewName(event.target.value);
              setNameError(null);
            }}
          />
          {nameError ? <FieldError>{nameError}</FieldError> : null}
          <p className="mt-xs text-caption text-ink-secondary">
            {surface.copy.newConnectionHint}
          </p>
        </div>
        <Button
          className="self-start"
          disabled={busy}
          type="button"
          variant="primary"
          onClick={() => {
            void generate();
          }}
        >
          {pending?.kind === "generate" ? "Gerando…" : "Gerar segredo"}
        </Button>
      </div>

      <Modal
        footer={
          <>
            <Button
              type="button"
              variant="tertiary"
              onClick={() => {
                setConfirm(null);
              }}
            >
              Cancelar
            </Button>
            <Button
              disabled={busy}
              type="button"
              variant="primary"
              onClick={() => {
                if (confirm?.kind === "rotate") {
                  void rotate(confirm.connection);
                }
              }}
            >
              {pending?.kind === "rotate" ? "Rotacionando…" : "Rotacionar agora"}
            </Button>
          </>
        }
        open={confirm?.kind === "rotate"}
        title={
          confirm?.kind === "rotate"
            ? `Rotacionar o segredo de “${confirm.connection.name}”?`
            : "Rotacionar o segredo?"
        }
        onClose={() => {
          setConfirm(null);
        }}
      >
        {surface.copy.rotateWarning}
      </Modal>

      <Modal
        footer={
          <>
            <Button
              type="button"
              variant="tertiary"
              onClick={() => {
                setConfirm(null);
              }}
            >
              Cancelar
            </Button>
            <form action={`${basePath}/status`} method="post">
              <input
                name="integration_connection_id"
                type="hidden"
                value={confirm?.kind === "disable" ? confirm.connection.integration_connection_id : ""}
              />
              <input name="status" type="hidden" value="DISABLED" />
              <Button type="submit" variant="danger">
                Desativar agora
              </Button>
            </form>
          </>
        }
        open={confirm?.kind === "disable"}
        title={
          confirm?.kind === "disable"
            ? `Desativar “${confirm.connection.name}”?`
            : surface.copy.disableTitle
        }
        onClose={() => {
          setConfirm(null);
        }}
      >
        {surface.copy.disableWarning}
      </Modal>
    </Card>
  );
}
