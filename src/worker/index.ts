// Worker do site: /api/leads grava o formulário no D1; o resto são os assets estáticos.
import { validateLead } from "../lead";
import { notifyTelegram, type TelegramEnv } from "./telegram";

// Tipos mínimos do runtime da Cloudflare usados aqui (sem depender de @cloudflare/workers-types).
interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  run(): Promise<unknown>;
}

/** Mantém o Worker vivo para tarefas depois da resposta (o aviso no Telegram). */
export interface WorkerContext {
  waitUntil(promise: Promise<unknown>): void;
}

export interface Env extends TelegramEnv {
  DB: { prepare(query: string): D1PreparedStatement };
  ASSETS: { fetch(request: Request): Promise<Response> };
}

const ALLOWED_ORIGINS = /^https:\/\/(www\.)?marct\.co$|^http:\/\/localhost(:\d+)?$/;
const MAX_BODY = 4096;

const json = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" },
  });

export async function handleLead(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
  if (request.method !== "POST") return json({ ok: false, error: "method" }, 405);
  const origin = request.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.test(origin)) return json({ ok: false, error: "origin" }, 403);

  const text = await request.text();
  if (text.length > MAX_BODY) return json({ ok: false, error: "size" }, 413);
  let body: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("not an object");
    body = parsed as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: "json" }, 400);
  }

  // Campo-isca invisível: gente não preenche, robô preenche. Responde ok e não grava.
  if (typeof body.site === "string" && body.site.trim()) return json({ ok: true }, 201);

  const result = validateLead(body);
  if (!result.ok) return json({ ok: false, errors: result.errors }, 422);

  const { nome, whatsapp, empresa, ramo, produto, servicos, origem } = result.lead;
  await env.DB.prepare(
    "INSERT INTO leads (nome, whatsapp, empresa, ramo, produto, servicos, origem) VALUES (?, ?, ?, ?, ?, ?, ?)",
  )
    .bind(nome, whatsapp, empresa, ramo, produto, servicos, origem)
    .run();
  // Gravado: avisa no Telegram sem segurar a resposta; falha no aviso não perde o contato
  const notice = notifyTelegram(env, result.lead).catch((error) => console.error("telegram", error));
  if (ctx) ctx.waitUntil(notice);
  else await notice;
  return json({ ok: true }, 201);
}

export default {
  async fetch(request: Request, env: Env, ctx?: WorkerContext): Promise<Response> {
    const { pathname } = new URL(request.url);
    if (pathname === "/api/leads") {
      try {
        return await handleLead(request, env, ctx);
      } catch (error) {
        console.error("lead", error);
        return json({ ok: false, error: "server" }, 500);
      }
    }
    return env.ASSETS.fetch(request);
  },
};
