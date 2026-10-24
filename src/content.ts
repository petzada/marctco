// Tudo o que é texto do site mora aqui: a cena 3D, a camada de texto e o fallback
// sem WebGL leem a mesma lista, na mesma ordem.

// DDI + DDD + número, só dígitos.
export const WHATSAPP_NUMBER = "5511974815782";

export type SectionId = "hero" | "gmb" | "lp" | "social" | "ads" | "ai" | "contact";

export interface Section {
  id: SectionId;
  title: string;
  /** Subtítulo: nomeia o serviço, já que a página não tem eyebrow. */
  body: string;
  /** Texto que já chega preenchido na conversa do WhatsApp. */
  whatsappText: string;
}

export const SECTIONS: readonly Section[] = [
  {
    id: "hero",
    title: "Presença digital para o comércio do bairro.",
    body: "Role e passeie pela rua.",
    whatsappText: "Olá! Vim pelo site da marct.co e quero colocar meu negócio no mapa.",
  },
  {
    id: "gmb",
    title: "Ser achado no mapa.",
    body: "Google Meu Negócio completo: fotos, horário e avaliações. Quem procura perto encontra você primeiro.",
    whatsappText: "Olá! Quero ajuda com o Google Meu Negócio da minha empresa.",
  },
  {
    id: "lp",
    title: "Um endereço próprio que converte.",
    body: "Landing page rápida, só sua, feita para virar conversa.",
    whatsappText: "Olá! Quero uma landing page para o meu negócio.",
  },
  {
    id: "social",
    title: "Sua vitrine aberta todo dia.",
    body: "Redes sociais e mídias digitais: calendário, posts e respostas, com gestão e conteúdo.",
    whatsappText: "Olá! Quero ajuda com as redes sociais do meu negócio.",
  },
  {
    id: "ads",
    title: "Anúncio para quem está perto.",
    body: "Tráfego pago no raio do seu bairro, sem pagar por quem nunca vai passar na porta.",
    whatsappText: "Olá! Quero anunciar para quem está perto do meu negócio.",
  },
  {
    id: "ai",
    title: "Influenciadores e comerciais de IA.",
    body: "Conteúdo sintético: rostos, vozes e vídeos gerados com IA para a sua marca, e outras ferramentas sob medida.",
    whatsappText: "Olá! Quero saber mais sobre conteúdo com IA para o meu negócio.",
  },
  {
    id: "contact",
    title: "Seu negócio, visto.",
    body: "Conte o que você vende e onde. A conversa começa no WhatsApp.",
    whatsappText: "Olá! Vim pelo site da marct.co e quero conversar sobre o meu negócio.",
  },
];

export function whatsappUrl(text: string, number = WHATSAPP_NUMBER): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
