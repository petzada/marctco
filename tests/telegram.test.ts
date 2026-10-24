import { describe, expect, it } from "vitest";
import type { Lead } from "../src/lead";
import { formatPhone, leadMessage, notifyTelegram } from "../src/worker/telegram";

const lead: Lead = {
  nome: "Ana <b>Souza</b>",
  whatsapp: "5511974815782",
  empresa: "Padaria & Café",
  ramo: "Padaria",
  produto: "Pão de queijo",
  servicos: "Gestão de tráfego",
  origem: "gmb",
};

describe("aviso no Telegram", () => {
  it("formata o WhatsApp para leitura", () => {
    expect(formatPhone("5511974815782")).toBe("+55 11 97481-5782");
    expect(formatPhone("551134567890")).toBe("+55 11 3456-7890");
  });

  it("lista os dados normalizados, escapando HTML, com a origem legível", () => {
    const { text, parse_mode } = leadMessage(lead);
    expect(parse_mode).toBe("HTML");
    expect(text).toContain("<b>WhatsApp:</b> +55 11 97481-5782");
    expect(text).toContain("<b>Nome:</b> Ana &lt;b&gt;Souza&lt;/b&gt;");
    expect(text).toContain("<b>Empresa:</b> Padaria &amp; Café");
    expect(text).toContain("<b>Origem:</b> Google Meu Negócio");
    expect(leadMessage({ ...lead, servicos: "" }).text).toContain("<b>Serviços:</b> Nenhum marcado");
  });

  it("botão abre a conversa no WhatsApp do cliente já com uma saudação", () => {
    const [[button]] = leadMessage(lead).reply_markup.inline_keyboard as [[{ text: string; url: string }]];
    expect(button.text).toBe("Abrir no WhatsApp");
    expect(button.url).toMatch(/^https:\/\/wa\.me\/5511974815782\?text=Ol%C3%A1%2C%20Ana!/);
  });

  it("envia para o chat configurado e pula quando falta token ou chat", async () => {
    const calls: [string, RequestInit][] = [];
    const send = (async (url: string, init: RequestInit) => {
      calls.push([url, init]);
      return new Response("{}");
    }) as unknown as typeof fetch;
    await notifyTelegram({}, lead, send);
    await notifyTelegram({ TELEGRAM_BOT_TOKEN: "t" }, lead, send);
    expect(calls).toHaveLength(0);
    await notifyTelegram({ TELEGRAM_BOT_TOKEN: "123:abc", TELEGRAM_CHAT_ID: "42" }, lead, send);
    expect(calls[0]![0]).toBe("https://api.telegram.org/bot123:abc/sendMessage");
    expect(JSON.parse(calls[0]![1].body as string).chat_id).toBe("42");
  });
});
