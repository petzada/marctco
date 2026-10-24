import { SECTIONS, SERVICES, whatsappUrl, type Section } from "./content.ts";
import { LEAD_FIELDS } from "./lead.ts";

// Gera o HTML das seções no build (plugin em vite.config.ts): o texto existe sem
// JavaScript e sem WebGL, e a cena só se sobrepõe a ele.

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** CTA de seção: abre o formulário (lead-form.ts); sem JavaScript, segue para o WhatsApp. */
export function ctaLink(section: Section, label = section.cta): string {
  return `<a class="cta" href="${escape(whatsappUrl(section.whatsappText))}" target="_blank" rel="noopener" data-lead="${section.id}">${escape(label)}</a>`;
}

const FOOTER = `
    <footer class="foot">
      <span>Agência de posicionamento digital para empresas e negócios</span>
      <span>Operada comercialmente pela Marct Soluções Digitais</span>
      <span>CNPJ 63.940.273/0001-36</span>
    </footer>`;

function renderSection(section: Section, index: number, last: number): string {
  const heading = index === 0 ? "h1" : "h2";
  const logo = index === 0 ? `<p class="logo logo--hero" aria-hidden="true">marct.co</p>` : "";
  // O rodapé fecha a última seção: aparece junto com o fim da página
  const footer = index === last ? FOOTER : "";
  return `<section class="chapter chapter--${section.id}" id="${section.id}" data-index="${index}">
  <div class="panel">
    <div class="copy">
      ${logo}
      <${heading} class="title">${escape(section.title)}</${heading}>
      <p class="body">${escape(section.body)}</p>
      ${ctaLink(section)}
    </div>
  </div>${footer}
</section>`;
}

export function renderSections(sections: readonly Section[] = SECTIONS): string {
  return sections.map((section, i) => renderSection(section, i, sections.length - 1)).join("\n");
}

/** Serviços ao lado do logo no header da última etapa, separados por bullets. */
export function renderHeaderServices(): string {
  return SERVICES.map((service) => `<span>${escape(service)}</span>`).join('<span aria-hidden="true">•</span>');
}

/** Modal do formulário de contato e o toast de confirmação. */
export function renderLeadDialog(): string {
  const fields = LEAD_FIELDS.map(
    (f) => `
      <label class="field">
        <span class="field__label">${escape(f.label)}</span>
        <input name="${f.name}" type="${f.type}" required maxlength="${f.maxLength}" autocomplete="${f.autocomplete}"
          placeholder="${escape(f.placeholder)}"${f.type === "tel" ? ' inputmode="tel"' : ""} aria-describedby="lead-${f.name}-error" />
        <small class="field__error" id="lead-${f.name}-error"></small>
      </label>`,
  ).join("");
  return `<dialog class="lead" id="lead-dialog" aria-labelledby="lead-title">
  <form class="lead__form" novalidate>
    <button type="button" class="lead__close" data-close aria-label="Fechar">×</button>
    <h2 class="lead__title" id="lead-title">Fale com a marct.co</h2>
    <p class="lead__intro">Conte um pouco do seu negócio. Respondemos pelo WhatsApp.</p>${fields}
    <div class="lead__hp" aria-hidden="true">
      <label>Site <input name="site" type="text" tabindex="-1" autocomplete="off" /></label>
    </div>
    <p class="lead__status" role="alert"></p>
    <button type="submit" class="cta lead__submit">Enviar</button>
    <p class="lead__privacy">Usamos esses dados só para falar com você sobre o seu negócio.</p>
  </form>
</dialog>
<div class="toast" id="toast" role="status" aria-live="polite" hidden></div>`;
}
