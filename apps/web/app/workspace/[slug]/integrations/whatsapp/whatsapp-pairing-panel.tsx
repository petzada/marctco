"use client";

import type { WhatsAppPairingState } from "@marctco/domain";
import { useEffect, useState, type FormEvent } from "react";
import { Button } from "../../../../../components/ui/button";
import { Card } from "../../../../../components/ui/card";
import { EmptyState } from "../../../../../components/ui/empty-state";
import { StatusBadge, type StatusBadgeTone } from "../../../../../components/ui/status-badge";

export interface WhatsAppConnectionReading {
  readonly instance_name: string;
  readonly status: "ACTIVE" | "DISABLED";
  readonly pairing_state: WhatsAppPairingState;
}

interface WhatsAppPairingPanelProps {
  readonly slug: string;
  readonly canManage: boolean;
  readonly webhookReady: boolean;
  readonly initialConnection: WhatsAppConnectionReading | null;
}

const PAIRING_LABEL: Readonly<Record<WhatsAppPairingState, string>> = {
  DISCONNECTED: "Desconectado",
  CONNECTING: "Conectando",
  QR_PENDING: "Aguardando QR",
  CONNECTED: "Conectado",
  SUSPENDED: "Suspenso",
  ERROR: "Erro"
};

const PAIRING_TONE: Readonly<Record<WhatsAppPairingState, StatusBadgeTone>> = {
  DISCONNECTED: "neutral",
  CONNECTING: "info",
  QR_PENDING: "warning",
  CONNECTED: "success",
  SUSPENDED: "danger",
  ERROR: "danger"
};

const POLL_MS = 3000;

function qrImageSrc(base64: string): string | null {
  return base64.startsWith("data:image/") ? base64 : null;
}

function errorMessage(code: string | undefined): string {
  if (code === "webhook_not_public") {
    return "O webhook precisa de um endereço HTTPS público. Não dá para parear neste ambiente.";
  }
  return "Não foi possível falar com o provedor.";
}

export function WhatsAppPairingPanel({
  slug,
  canManage,
  webhookReady,
  initialConnection
}: WhatsAppPairingPanelProps) {
  const [connection, setConnection] = useState(initialConnection);
  const [base64, setBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rotated, setRotated] = useState(false);

  const pairing_state = connection?.pairing_state ?? null;
  const shouldPoll = pairing_state === "QR_PENDING" || pairing_state === "CONNECTING";

  useEffect(() => {
    if (!shouldPoll) {
      return;
    }
    const handle = window.setInterval(() => {
      void (async () => {
        const response = await fetch(`/workspace/${slug}/integrations/whatsapp/status`);
        if (!response.ok) {
          return;
        }
        const body = (await response.json()) as { connection: WhatsAppConnectionReading | null };
        setConnection(body.connection);
        if (
          body.connection?.pairing_state === "CONNECTED" ||
          body.connection?.pairing_state === "DISCONNECTED" ||
          body.connection?.pairing_state === "ERROR" ||
          body.connection?.pairing_state === "SUSPENDED"
        ) {
          setBase64(null);
          setPairingCode(null);
        }
      })();
    }, POLL_MS);
    return () => window.clearInterval(handle);
  }, [shouldPoll, slug]);

  async function postAction(path: "pair" | "connect" | "disconnect" | "rotate") {
    setPending(true);
    setError(null);
    setRotated(false);
    try {
      const response = await fetch(`/workspace/${slug}/integrations/whatsapp/${path}`, {
        method: "POST"
      });
      const body = (await response.json()) as {
        error?: string;
        pairing_state?: WhatsAppPairingState;
        base64?: string | null;
        pairing_code?: string | null;
        instance_name?: string;
        connection?: WhatsAppConnectionReading;
        rotated?: boolean;
      };
      if (!response.ok) {
        setError(errorMessage(body.error));
        if (path === "pair") {
          const statusResponse = await fetch(`/workspace/${slug}/integrations/whatsapp/status`);
          if (statusResponse.ok) {
            const statusBody = (await statusResponse.json()) as {
              connection: WhatsAppConnectionReading | null;
            };
            if (statusBody.connection) {
              setConnection(statusBody.connection);
            }
          }
        }
        return;
      }
      if (path === "rotate") {
        setRotated(true);
        return;
      }
      if (body.connection) {
        setConnection(body.connection);
        setBase64(null);
        setPairingCode(null);
        return;
      }
      if (body.pairing_state) {
        setConnection((current) => ({
          instance_name: body.instance_name ?? current?.instance_name ?? "",
          status: current?.status ?? "ACTIVE",
          pairing_state: body.pairing_state as WhatsAppPairingState
        }));
        setBase64(body.base64 ?? null);
        setPairingCode(body.pairing_code ?? null);
      }
    } catch {
      setError(errorMessage(undefined));
    } finally {
      setPending(false);
    }
  }

  function onPair(event: FormEvent) {
    event.preventDefault();
    void postAction("pair");
  }

  if (connection === null) {
    return (
      <Card>
        <EmptyState
          title="Conecte o WhatsApp da empresa"
          description="Pareie o número pelo QR. O CRM usa essa instância no primeiro contato automático. A conversa com o lead continua no WhatsApp."
          action={
            canManage ? (
              <form className="mt-sm" onSubmit={onPair}>
                <Button disabled={pending || !webhookReady} type="submit" variant="primary">
                  Conectar WhatsApp
                </Button>
              </form>
            ) : null
          }
        />
        {!webhookReady ? (
          <p className="mt-sm text-center text-body-sm text-ink-secondary" role="status">
            O webhook precisa de um endereço HTTPS público. Não dá para parear neste ambiente.
          </p>
        ) : null}
        {error ? (
          <p className="mt-sm text-center text-body-sm text-danger-ink" role="alert">
            {error}
          </p>
        ) : null}
      </Card>
    );
  }

  const qrSrc = base64 ? qrImageSrc(base64) : null;

  return (
    <Card className="grid gap-lg">
      <div className="grid gap-sm md:grid-cols-2">
        <div>
          <p className="text-label text-ink-secondary">Conexão</p>
          <p className="mt-xxs">
            <StatusBadge dot tone={connection.status === "ACTIVE" ? "success" : "neutral"}>
              {connection.status === "ACTIVE" ? "Ativa" : "Desligada"}
            </StatusBadge>
          </p>
        </div>
        <div>
          <p className="text-label text-ink-secondary">Pareamento</p>
          <p className="mt-xxs">
            <StatusBadge dot tone={PAIRING_TONE[connection.pairing_state]}>
              {PAIRING_LABEL[connection.pairing_state]}
            </StatusBadge>
          </p>
        </div>
      </div>

      {connection.instance_name ? (
        <p className="text-caption text-ink-muted">Instância {connection.instance_name}</p>
      ) : null}

      {qrSrc ? (
        <div className="grid justify-items-center gap-sm">
          {/* QR arrives as a data URL from the provider; Next Image cannot host it. */}
          <img alt="QR Code para parear o WhatsApp" className="size-48" src={qrSrc} />
          <p className="text-body-sm text-ink-secondary">
            Escaneie o QR no WhatsApp da empresa. O status atualiza sozinho.
          </p>
        </div>
      ) : null}

      {pairingCode ? (
        <p className="text-body-sm text-ink">
          Código de pareamento: <span className="font-mono">{pairingCode}</span>
        </p>
      ) : null}

      {connection.pairing_state === "QR_PENDING" && canManage && qrSrc === null ? (
        <p className="text-body-sm text-ink-secondary">
          O QR não fica guardado nesta tela. Gere um novo para continuar o pareamento.
        </p>
      ) : null}

      {error ? (
        <p className="text-body-sm text-danger-ink" role="alert">
          {error}
        </p>
      ) : null}
      {rotated ? (
        <p className="text-body-sm text-ink" role="status">
          O token do webhook foi atualizado no provedor. Ele não aparece nesta tela.
        </p>
      ) : null}

      {canManage ? (
        <div className="flex flex-wrap gap-sm">
          {connection.pairing_state === "CONNECTED" ? (
            <Button
              disabled={pending}
              onClick={() => void postAction("disconnect")}
              type="button"
              variant="secondary"
            >
              Desconectar
            </Button>
          ) : (
            <Button
              disabled={pending || !webhookReady}
              onClick={() => void postAction(connection.instance_name ? "connect" : "pair")}
              type="button"
              variant="primary"
            >
              {connection.pairing_state === "DISCONNECTED" ? "Reconectar" : "Gerar QR"}
            </Button>
          )}
          <Button disabled={pending || !webhookReady} onClick={() => void postAction("rotate")} type="button" variant="tertiary">
            Atualizar token do webhook
          </Button>
        </div>
      ) : (
        <p className="text-body-sm text-ink-secondary">
          Somente a Direção conecta, desconecta ou atualiza o token. A Gestão acompanha o status.
        </p>
      )}
    </Card>
  );
}
