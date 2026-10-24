// Tudo o que é texto do site mora aqui: a cena 3D, a camada de texto e o fallback
// sem WebGL leem a mesma lista, na mesma ordem.

// DDI + DDD + número, só dígitos.
export const WHATSAPP_NUMBER = "5511974815782";

export type SectionId = "hero" | "gmb" | "lp" | "social" | "ads" | "ai" | "contact";

export interface Section {
  id: SectionId;
  /** Título em uma linha. */
  title: string;
  /** Subtítulo: nomeia o serviço, já que a página não tem eyebrow. */
  body: string;
  /** Rótulo do botão de WhatsApp da seção. */
  cta: string;
  /** Texto que já chega preenchido na conversa do WhatsApp. */
  whatsappText: string;
}

/** Rótulo do CTA fixo do cabeçalho. */
export const HEADER_CTA = "Entrar em contato";

export const SECTIONS: readonly Section[] = [
  {
    id: "hero",
    title: "Presença digital para o seu negócio",
    body: "Role e descubra nossa entrega",
    cta: "Entrar em contato",
    whatsappText: "Olá! Vim pelo site da marct.co e quero colocar meu negócio no mapa.",
  },
  {
    id: "gmb",
    title: "Seja encontrado no mapa",
    body: "Google Meu Negócio: quem procura perto, encontra você primeiro",
    cta: "Quero ser descoberto",
    whatsappText: "Olá! Quero ajuda com o Google Meu Negócio da minha empresa.",
  },
  {
    id: "lp",
    title: "Um endereço digital que converte",
    body: "Página de negócios personalizada, feita para virar uma conversa",
    cta: "Quero uma LP",
    whatsappText: "Olá! Quero uma landing page para o meu negócio.",
  },
  {
    id: "social",
    title: "Sua vitrine aberta todos os dias",
    body: "Redes sociais e mídias digitais com estratégias específicas de conversão",
    cta: "Quero essa gestão",
    whatsappText: "Olá! Quero ajuda com as redes sociais do meu negócio.",
  },
  {
    id: "ads",
    title: "Anúncio para quem precisa receber",
    body: "Tráfego pago focado na sua região, sem pagar por quem nunca vai passar na porta",
    cta: "Quero mais clientes",
    whatsappText: "Olá! Quero anunciar para quem está perto do meu negócio.",
  },
  {
    id: "ai",
    title: "Conteúdo sintético para o seu negócio",
    body: "Rostos, vozes e vídeos gerados com inteligência artificial, expandindo sua marca nas redes",
    cta: "Quero mais conteúdo",
    whatsappText: "Olá! Quero saber mais sobre conteúdo com IA para o meu negócio.",
  },
  {
    id: "contact",
    title: "Seu negócio pro mundo",
    body: "Conte-nos o que você vende e onde, e o resto é com a gente",
    cta: "Começar no WhatsApp",
    whatsappText: "Olá! Vim pelo site da marct.co e quero conversar sobre o meu negócio.",
  },
];

export function whatsappUrl(text: string, number = WHATSAPP_NUMBER): string {
  return `https://wa.me/${number}?text=${encodeURIComponent(text)}`;
}
