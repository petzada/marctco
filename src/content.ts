// Tudo o que é texto do site mora aqui: a cena 3D, a camada de texto e o fallback
// sem WebGL leem a mesma lista, na mesma ordem.

// Em aberto: número real de WhatsApp (DDI + DDD + número, só dígitos).
export const WHATSAPP_NUMBER = "5500000000000";

export type SectionId = "hero" | "gmb" | "lp" | "social" | "ads" | "ai" | "contact";

export interface Section {
  id: SectionId;
  /** "01 — Google Meu Negócio"; vazio no hero e no contato. */
  kicker: string;
  title: string;
  body: string;
  /** Texto que já chega preenchido na conversa do WhatsApp. */
  whatsappText: string;
  badge?: string;
}

export const SECTIONS: readonly Section[] = [
  {
    id: "hero",
    kicker: "",
    title: "Presença digital para o comércio do bairro.",
    body: "Role e passeie pela rua.",
    whatsappText: "Olá! Vim pelo site da marct.co e quero colocar meu negócio no mapa.",
  },
  {
    id: "gmb",
    kicker: "01 — Google Meu Negócio",
    title: "Ser achado no mapa.",
    body: "Perfil completo, fotos, horário e avaliações. Quem procura perto encontra você primeiro.",
    whatsappText: "Olá! Quero ajuda com o Google Meu Negócio da minha empresa.",
  },
  {
    id: "lp",
    kicker: "02 — Landing pages",
    title: "Um endereço próprio que converte.",
    body: "Uma página rápida, só sua, feita para virar conversa.",
    whatsappText: "Olá! Quero uma landing page para o meu negócio.",
  },
  {
    id: "social",
    kicker: "03 — Redes sociais e mídias digitais",
    title: "Gestão e conteúdo.",
    body: "Calendário, posts e respostas. Sua vitrine aberta todo dia.",
    whatsappText: "Olá! Quero ajuda com as redes sociais do meu negócio.",
  },
  {
    id: "ads",
    kicker: "04 — Tráfego pago",
    title: "Anúncio para quem está perto.",
    body: "Campanhas no raio do seu bairro, sem pagar por quem nunca vai passar na porta.",
    whatsappText: "Olá! Quero anunciar para quem está perto do meu negócio.",
  },
  {
    id: "ai",
    kicker: "05 — Conteúdo sintético com IA",
    badge: "Novo",
    title: "Influenciadores e comerciais de IA.",
    body: "Rostos, vozes e vídeos gerados com IA para a sua marca, e outras ferramentas sob medida.",
    whatsappText: "Olá! Quero saber mais sobre conteúdo com IA para o meu negócio.",
  },
  {
    id: "contact",
    kicker: "",
    title: "Seu negócio, visto.",
    body: "Conte o que você vende e onde. A conversa começa no WhatsApp.",
    whatsappText: "Olá! Vim pelo site da marct.co e quero conversar sobre o meu negócio.",
  },
];

export function whatsappUrl(text: string, number = WHATSAPP_NUMBER): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
