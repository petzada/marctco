import { cloudflare } from "@cloudflare/vite-plugin";
import { defineConfig, type Plugin } from "vite";
import { HEADER_CTA, SECTIONS, whatsappUrl } from "./src/content.ts";
import { renderHeaderServices, renderLeadDialog, renderSections } from "./src/render-sections.ts";

// As seções saem de src/content.ts direto no HTML: o texto existe sem JavaScript e sem WebGL.
function sectionsHtml(): Plugin {
  return {
    name: "marctco-sections",
    transformIndexHtml: (html) =>
      html
        .replace("<!--sections-->", renderSections())
        .replace("<!--header-services-->", renderHeaderServices())
        .replace("<!--lead-dialog-->", renderLeadDialog())
        .replace("%WHATSAPP_URL%", whatsappUrl(SECTIONS[SECTIONS.length - 1]!.whatsappText).replace(/&/g, "&amp;"))
        .replace("%HEADER_CTA%", HEADER_CTA),
  };
}

// O plugin da Cloudflare (usado pelo `cf deploy` no CI) carrega o cloudflare.config.ts e
// exige Node 22.18+. Em Node mais antigo o build sai como site estático puro, igual ao servido.
const [major = 0, minor = 0] = process.versions.node.split(".").map(Number);
const cloudflareReady = major > 22 || (major === 22 && minor >= 18);

export default defineConfig({
  plugins: [sectionsHtml(), ...(cloudflareReady ? [cloudflare()] : [])],
  build: {
    target: "es2022",
    // O chunk do three.js (~180 kB gzip) é esperado; o orçamento real é o check-budget.
    chunkSizeWarningLimit: 800,
    // three.js é a maior parte do bundle; separado, o cache sobrevive a mudanças no site.
    rollupOptions: { output: { manualChunks: (id) => (id.includes("node_modules/three") ? "three" : undefined) } },
  },
});
