import { describe, expect, it } from "vitest";
import { SECTIONS, whatsappUrl } from "../src/content";
import { renderSections } from "../src/render-sections";

describe("seções", () => {
  it("seguem a ordem de exibição dos serviços", () => {
    expect(SECTIONS.map((s) => s.id)).toEqual(["hero", "gmb", "lp", "social", "ads", "ai", "contact"]);
  });

  it("toda seção leva ao WhatsApp com a mensagem já escrita", () => {
    const html = renderSections();
    for (const s of SECTIONS) {
      expect(html).toContain(`id="${s.id}"`);
      expect(html).toContain(whatsappUrl(s.whatsappText).replace(/&/g, "&amp;"));
      expect(html).toContain(`>${s.cta}</a>`);
    }
  });

  it("o hero tem o único h1", () => {
    expect(renderSections().match(/<h1/g)).toHaveLength(1);
  });

  it("codifica o texto da conversa na URL", () => {
    expect(whatsappUrl("Olá & oi", "5511999999999")).toBe("https://wa.me/5511999999999?text=Ol%C3%A1%20%26%20oi");
  });
});
