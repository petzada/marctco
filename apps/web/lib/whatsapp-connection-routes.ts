import {
  getWhatsAppConnection,
  WhatsAppConnectionError,
  type UserContext
} from "@marctco/db";
import { NextResponse } from "next/server";
import {
  canManageIntegrationSecret,
  canOpenIntegrationScreen
} from "./integration-access";
import { publicIntegrationUrl } from "./public-origin";
import { resolveWorkspaceAccess } from "./workspace-access";
import {
  connectWhatsAppWorkspace,
  disconnectWhatsAppWorkspace,
  pairWhatsAppWorkspace,
  refreshWhatsAppPairing,
  rotateWhatsAppWebhook,
  WHATSMIAU_WEBHOOK_PATH,
  WhatsAppProviderError
} from "./whatsapp-connection-http";
import { createWhatsMiauClient, readWhatsMiauApiKey } from "./whatsmiau-client";

interface RouteContext {
  readonly params: Promise<{ slug: string }>;
}

type ResolvedAccess = {
  readonly slug: string;
  readonly context: UserContext;
};

async function resolveIntegrationAccess(
  slug: string,
  gate: "read" | "manage"
): Promise<ResolvedAccess | NextResponse> {
  const access = await resolveWorkspaceAccess(slug);
  if (access.status === "unauthenticated") {
    return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  }
  const allowed =
    access.status === "resolved" &&
    (gate === "read"
      ? canOpenIntegrationScreen(access.workspace.role)
      : canManageIntegrationSecret(access.workspace.role));
  if (access.status !== "resolved" || !allowed) {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return {
    slug,
    context: access.workspace.context
  };
}

function providerClient(): ReturnType<typeof createWhatsMiauClient> {
  const api_key = readWhatsMiauApiKey();
  if (api_key === null) {
    throw new WhatsAppProviderError("provider_unavailable");
  }
  return createWhatsMiauClient({ api_key });
}

function webhookUrlFrom(request: Request): string {
  return publicIntegrationUrl(request.headers, WHATSMIAU_WEBHOOK_PATH);
}

function jsonError(error: unknown): NextResponse {
  if (error instanceof WhatsAppProviderError) {
    const status = error.code === "webhook_not_public" ? 409 : 503;
    return NextResponse.json({ error: error.code }, { status });
  }
  if (error instanceof WhatsAppConnectionError && error.code === "FORBIDDEN") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  if (error instanceof WhatsAppConnectionError && error.code === "NOT_FOUND") {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
  return NextResponse.json({ error: "provider_unavailable" }, { status: 503 });
}

function publicConnection(view: {
  readonly instance_name: string;
  readonly status: string;
  readonly pairing_state: string;
}) {
  return {
    instance_name: view.instance_name,
    status: view.status,
    pairing_state: view.pairing_state
  };
}

export async function GET_WHATSAPP_STATUS(
  _request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { slug } = await params;
  const resolved = await resolveIntegrationAccess(slug, "read");
  if (resolved instanceof NextResponse) {
    return resolved;
  }

  const stored = await getWhatsAppConnection(resolved.context);
  if (stored === null) {
    return NextResponse.json({ connection: null });
  }

  try {
    const client = providerClient();
    const view = await refreshWhatsAppPairing({ context: resolved.context, client });
    return NextResponse.json({ connection: publicConnection(view) });
  } catch (error) {
    if (error instanceof WhatsAppProviderError && error.code === "provider_unavailable") {
      return NextResponse.json({ connection: publicConnection(stored) });
    }
    return jsonError(error);
  }
}

export async function POST_WHATSAPP_PAIR(
  request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { slug } = await params;
  const resolved = await resolveIntegrationAccess(slug, "manage");
  if (resolved instanceof NextResponse) {
    return resolved;
  }
  try {
    const paired = await pairWhatsAppWorkspace({
      context: resolved.context,
      webhook_url: webhookUrlFrom(request),
      client: providerClient()
    });
    return NextResponse.json({
      pairing_state: paired.pairing_state,
      base64: paired.base64,
      pairing_code: paired.pairing_code,
      instance_name: paired.instance_name
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST_WHATSAPP_CONNECT(
  request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { slug } = await params;
  const resolved = await resolveIntegrationAccess(slug, "manage");
  if (resolved instanceof NextResponse) {
    return resolved;
  }
  try {
    const paired = await connectWhatsAppWorkspace({
      context: resolved.context,
      client: providerClient()
    });
    return NextResponse.json({
      pairing_state: paired.pairing_state,
      base64: paired.base64,
      pairing_code: paired.pairing_code,
      instance_name: paired.instance_name
    });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST_WHATSAPP_DISCONNECT(
  request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { slug } = await params;
  const resolved = await resolveIntegrationAccess(slug, "manage");
  if (resolved instanceof NextResponse) {
    return resolved;
  }
  try {
    const view = await disconnectWhatsAppWorkspace({
      context: resolved.context,
      client: providerClient()
    });
    return NextResponse.json({ connection: publicConnection(view) });
  } catch (error) {
    return jsonError(error);
  }
}

export async function POST_WHATSAPP_ROTATE(
  request: Request,
  { params }: RouteContext
): Promise<NextResponse> {
  const { slug } = await params;
  const resolved = await resolveIntegrationAccess(slug, "manage");
  if (resolved instanceof NextResponse) {
    return resolved;
  }
  try {
    await rotateWhatsAppWebhook({
      context: resolved.context,
      webhook_url: webhookUrlFrom(request),
      client: providerClient()
    });
    return NextResponse.json({ rotated: true });
  } catch (error) {
    return jsonError(error);
  }
}
