import { getWhatsAppConnection } from "@marctco/db";
import { isPublicHttpsWebhookUrl } from "@marctco/domain";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import {
  canManageIntegrationSecret,
  canOpenIntegrationScreen
} from "../../../../../lib/integration-access";
import { publicIntegrationUrl } from "../../../../../lib/public-origin";
import { WHATSMIAU_WEBHOOK_PATH } from "../../../../../lib/whatsapp-connection-http";
import { resolveWorkspaceAccess } from "../../../../../lib/workspace-access";
import { WhatsAppPairingPanel } from "./whatsapp-pairing-panel";

export const metadata: Metadata = {
  title: "WhatsApp | marctco",
  description: "Conecte a instância WhatsMiau do workspace e acompanhe o pareamento"
};

export default async function WhatsAppIntegrationPage({
  params
}: Readonly<{ params: Promise<{ slug: string }> }>) {
  const { slug } = await params;
  const [access, requestHeaders] = await Promise.all([resolveWorkspaceAccess(slug), headers()]);
  if (access.status !== "resolved" || !canOpenIntegrationScreen(access.workspace.role)) {
    notFound();
  }

  const webhookUrl = publicIntegrationUrl(requestHeaders, WHATSMIAU_WEBHOOK_PATH);
  const connection = await getWhatsAppConnection(access.workspace.context);

  return (
    <main className="min-h-[100dvh] bg-canvas px-md py-xl md:px-lg md:py-xxl">
      <div className="mx-auto grid w-full max-w-content gap-lg">
        <header className="max-w-prose">
          <p className="text-eyebrow text-primary">Integração</p>
          <h1 className="mt-xs text-headline text-ink md:text-display-md">WhatsApp</h1>
          <p className="mt-sm text-body text-ink-secondary">
            Uma instância por workspace. O número da empresa envia o primeiro contato
            automático. A conversa continua no WhatsApp pessoal de cada atendente.
          </p>
        </header>

        <WhatsAppPairingPanel
          canManage={canManageIntegrationSecret(access.workspace.role)}
          initialConnection={
            connection
              ? {
                  instance_name: connection.instance_name,
                  status: connection.status,
                  pairing_state: connection.pairing_state
                }
              : null
          }
          slug={slug}
          webhookReady={isPublicHttpsWebhookUrl(webhookUrl)}
        />
      </div>
    </main>
  );
}
