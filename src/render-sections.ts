import { SECTIONS, whatsappUrl, type Section } from "./content.ts";

// Gera o HTML das seções no build (plugin em vite.config.ts): o texto existe sem
// JavaScript e sem WebGL, e a cena só se sobrepõe a ele.

const escape = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function ctaLink(section: Section, label = "conversar no whatsapp", extraClass = ""): string {
  return `<a class="cta ${extraClass}" href="${escape(whatsappUrl(section.whatsappText))}" target="_blank" rel="noopener">${escape(label)}</a>`;
}

function renderSection(section: Section, index: number): string {
  const heading = index === 0 ? "h1" : "h2";
  const logo = index === 0 ? `<p class="logo logo--hero" aria-hidden="true">marct.co</p>` : "";
  return `<section class="chapter chapter--${section.id}" id="${section.id}" data-index="${index}">
  <div class="panel">
    <div class="copy">
      ${logo}
      <${heading} class="title">${escape(section.title)}</${heading}>
      <p class="body">${escape(section.body)}</p>
      ${ctaLink(section)}
    </div>
  </div>
</section>`;
}

export function renderSections(sections: readonly Section[] = SECTIONS): string {
  return sections.map(renderSection).join("\n");
}
