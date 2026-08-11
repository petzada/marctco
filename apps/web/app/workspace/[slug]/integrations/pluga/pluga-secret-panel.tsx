"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { Modal } from "../../../../../components/ui/modal";
import { StatusBadge } from "../../../../../components/ui/status-badge";
import { maskIntegrationSecret } from "../../../../../lib/mask-integration-secret";
import { CopyBlock } from "./copy-block";

export interface PlugaConnectionSummaryProps {
  readonly status: "ACTIVE" | "DISABLED";
  readonly token_last4: string;
}

export interface PlugaSecretPanelProps {
  readonly slug: string;
  readonly endpointUrlHint: string;
  readonly connection: PlugaConnectionSummaryProps | null;
}

type PendingAction = "generate" | "rotate" | null;
type ConfirmKind = "rotate" | "disable" | null;

/**
 * The Direção-only half of the screen (ADR-0015): webhook URL, secret
 * generation/rotation and enable/disable. A client island because the
 * generated secret must be shown exactly once, in memory, never round-tripped
 * through a redirect or a URL where it would land in browser history or
 * server logs.
 */
export function PlugaSecretPanel({ slug, endpointUrlHint, connection }: PlugaSecretPanelProps) {
  const router = useRouter();
  const [revealed, setRevealed] = useState<{ token: string; token_last4: string } | null>(null);
  const [pending, setPending] = useState<PendingAction>(null);
  const [confirm, setConfirm] = useState<ConfirmKind>(null);
  const [error, setError] = useState<string | null>(null);

  async function generateOrRotate(action: "generate" | "rotate"): Promise<void> {
    setPending(action);
    setError(null);
    try {
      const response = await fetch(`/workspace/${slug}/integrations/pluga/secret`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action })
      });
      if (!response.ok) {
        setError(
          action === "generate"
            ? "Não foi possível gerar o segredo agora. Tente novamente."
            : "Não foi possível rotacionar o segredo agora. Tente novamente."
        );
        return;
      }
      const body = (await response.json()) as { token: string; token_last4: string };
      setRevealed(body);
      setConfirm(null);
      router.refresh();
    } finally {
      setPending(null);
    }
  }

  return (
    <Card className="flex flex-col gap-md">
      <div>
        <h2 className="text-title text-ink">Segredo e conexão</h2>
        <p className="mt-xs text-body-sm text-ink-secondary">
          Cole a URL e o segredo no destino HTTP Request da automação da Pluga.
        </p>
      </div>

      <div>
        <p className="text-label text-ink-secondary">URL do webhook</p>
        <CopyBlock code={endpointUrlHint} label="URL" />
      </div>

      {revealed ? (
        <div className="rounded-md border border-warning bg-warning-surface p-md">
          <p className="text-body-strong text-warning-ink">
            Copie o segredo agora — ele só aparece esta vez
          </p>
          <p className="mt-xs text-body-sm text-warning-ink">
            Depois de sair desta página, só o final do segredo fica visível. Se perder este
            valor, gere um novo.
          </p>
          <CopyBlock code={revealed.token} label="segredo" />
        </div>
      ) : null}

      {connection ? (
        <div className="flex flex-col gap-sm">
          <div className="flex flex-wrap items-center gap-sm">
            <StatusBadge dot tone={connection.status === "ACTIVE" ? "success" : "neutral"}>
              {connection.status === "ACTIVE" ? "Ativa" : "Desativada"}
            </StatusBadge>
            <span className="font-mono text-mono text-ink-secondary">
              {maskIntegrationSecret(connection.token_last4)}
            </span>
          </div>

          {error ? <p className="text-caption text-danger-ink">{error}</p> : null}

          <div className="flex flex-wrap gap-sm">
            <Button
              disabled={pending !== null}
              type="button"
              variant="secondary"
              onClick={() => {
                setConfirm("rotate");
              }}
            >
              Rotacionar segredo
            </Button>
            {connection.status === "ACTIVE" ? (
              <Button
                disabled={pending !== null}
                type="button"
                variant="tertiary"
                onClick={() => {
                  setConfirm("disable");
                }}
              >
                Desativar integração
              </Button>
            ) : (
              <form action={`/workspace/${slug}/integrations/pluga/status`} method="post">
                <input name="status" type="hidden" value="ACTIVE" />
                <Button type="submit" variant="secondary">
                  Ativar integração
                </Button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-sm">
          {error ? <p className="text-caption text-danger-ink">{error}</p> : null}
          <Button
            className="self-start"
            disabled={pending !== null}
            type="button"
            variant="primary"
            onClick={() => {
              void generateOrRotate("generate");
            }}
          >
            {pending === "generate" ? "Gerando…" : "Gerar segredo"}
          </Button>
        </div>
      )}

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
              disabled={pending !== null}
              type="button"
              variant="primary"
              onClick={() => {
                void generateOrRotate("rotate");
              }}
            >
              {pending === "rotate" ? "Rotacionando…" : "Rotacionar agora"}
            </Button>
          </>
        }
        open={confirm === "rotate"}
        title="Rotacionar o segredo?"
        onClose={() => {
          setConfirm(null);
        }}
      >
        O segredo atual para de funcionar imediatamente. Você vai precisar colar o novo valor
        na Pluga antes que os leads voltem a chegar.
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
            <form action={`/workspace/${slug}/integrations/pluga/status`} method="post">
              <input name="status" type="hidden" value="DISABLED" />
              <Button type="submit" variant="danger">
                Desativar agora
              </Button>
            </form>
          </>
        }
        open={confirm === "disable"}
        title="Desativar a integração?"
        onClose={() => {
          setConfirm(null);
        }}
      >
        Nenhum lead novo é aceito enquanto a integração estiver desativada. A configuração e o
        segredo continuam guardados — você pode reativar a qualquer momento sem gerar um novo
        segredo.
      </Modal>
    </Card>
  );
}
