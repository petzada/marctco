// Aviso de novo contato no Telegram do dono, pelo bot criado no BotFather: os dados já
// normalizados e um botão "Abrir no WhatsApp" direto na conversa com o cliente.
import type { Lead } from "../lead";

export interface TelegramEnv {
  /** Token do bot (BotFather). Sem ele, o aviso é pulado. */
  TELEGRAM_BOT_TOKEN?: string;
  /** Chat que recebe os avisos (o ID da sua conta no Telegram). */
  TELEGRAM_CHAT_ID?: string;
}

const ORIGIN_LABEL: Record<string, string> = {
  hero: "Abertura",
  gmb: "Google Meu Negócio",
  lp: "Landing pages",
  social: "Redes sociais",
  ads: "Tráfego pago",
  ai: "Conteúdo com IA",
  contact: "Contato final",
};

const html = (s: string) => s.replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" })[c]!);

/** 5511974815782 → +55 11 97481-5782 */
export function formatPhone(whatsapp: string): string {
  const m = /^55(\d{2})(\d{4,5})(\d{4})$/.exec(whatsapp);
  return m ? `+55 ${m[1]} ${m[2]}-${m[3]}` : `+${whatsapp}`;
}

/** Corpo do sendMessage: texto em HTML e o botão que abre a conversa no WhatsApp. */
export function leadMessage(lead: Lead) {
  const firstName = lead.nome.split(" ")[0] ?? lead.nome;
  const greeting = `Olá, ${firstName}! Aqui é a marct.co. Recebemos seu contato pelo site.`;
  const rows: [string, string][] = [
    ["Nome", lead.nome],
    ["WhatsApp", formatPhone(lead.whatsapp)],
    ["Empresa", lead.empresa],
    ["Ramo", lead.ramo],
    ["Produto principal", lead.produto],
    ["Serviços", lead.servicos || "Nenhum marcado"],
    ["Origem", ORIGIN_LABEL[lead.origem] ?? lead.origem],
  ];
  return {
    text: ["<b>Novo contato pelo site</b>", "", ...rows.map(([k, v]) => `<b>${k}:</b> ${html(v)}`)].join("\n"),
    parse_mode: "HTML",
    disable_web_page_preview: true,
    reply_markup: {
      inline_keyboard: [
        [{ text: "Abrir no WhatsApp", url: `https://wa.me/${lead.whatsapp}?text=${encodeURIComponent(greeting)}` }],
      ],
    },
  };
}

/** Envia o aviso; sem token ou chat configurados, não faz nada. */
export async function notifyTelegram(env: TelegramEnv, lead: Lead, send: typeof fetch = fetch): Promise<void> {
  if (!env.TELEGRAM_BOT_TOKEN || !env.TELEGRAM_CHAT_ID) return;
  const response = await send(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ chat_id: env.TELEGRAM_CHAT_ID, ...leadMessage(lead) }),
  });
  if (!response.ok) throw new Error(`telegram ${response.status}: ${await response.text()}`);
}
