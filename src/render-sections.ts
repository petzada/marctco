import { SECTIONS, whatsappUrl, type Section } from "./content.ts";

// Gera o HTML das seções no build (plugin em vite.config.ts): o texto existe sem
// JavaScript e sem WebGL, e a cena só se sobrepõe a ele.

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function ctaLink(section: Section, label = section.cta, extraClass = ""): string {
  return `<a class="cta ${extraClass}" href="${escape(whatsappUrl(section.whatsappText))}" target="_blank" rel="noopener">${escape(label)}</a>`;
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
  // O rodapé mora na última tela: termina junto com a página, sem faixa separada
  const footer = index === last ? FOOTER : "";
  return `<section class="chapter chapter--${section.id}" id="${section.id}" data-index="${index}">
  <div class="panel">
    <div class="copy">
      ${logo}
      <${heading} class="title">${escape(section.title)}</${heading}>
      <p class="body">${escape(section.body)}</p>
      ${ctaLink(section)}
    </div>${footer}
  </div>
</section>`;
}

export function renderSections(sections: readonly Section[] = SECTIONS): string {
  return sections.map((section, i) => renderSection(section, i, sections.length - 1)).join("\n");
}
