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

// Mapa do bundle: ANALYZE=1 pnpm build → dist/stats.html (fora do orçamento: fica fora de dist/assets)
const analyze = process.env.ANALYZE
  ? [(await import("rollup-plugin-visualizer")).visualizer({ filename: ".bundle-stats.html", gzipSize: true })]
  : [];

// O three.js (núcleo e pós-processamento) vai para o chunk "three", com os helpers de
// runtime do Rolldown, que senão caem num chunk qualquer e viram dependência de todos. O
// GLTFLoader e o decoder Meshopt (~22 kB gzip) ficam num chunk próprio, baixado só com o .glb.
const isThree = (id: string) => /node_modules[\\/]three[\\/]/.test(id);
const isLoader = (id: string) => /[\\/]examples[\\/]jsm[\\/](loaders|libs[\\/]meshopt)/.test(id);
const advancedChunks = {
  groups: [
    { name: "three", test: (id: string) => (isThree(id) && !isLoader(id)) || id.includes("rolldown:runtime") },
    { name: "gltf", test: (id: string) => isThree(id) && isLoader(id) },
  ],
};

export default defineConfig({
  plugins: [sectionsHtml(), ...(cloudflareReady ? [cloudflare()] : []), ...analyze],
  build: {
    target: "es2022",
    // O chunk do three.js (~170 kB gzip) é esperado; o orçamento real é o check-budget.
    chunkSizeWarningLimit: 800,
    // three.js é a maior parte do bundle; separado, o cache sobrevive a mudanças no site.
    rollupOptions: { output: { advancedChunks } },
  },
});
