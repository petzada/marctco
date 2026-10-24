import type { Plugin } from "vite";
import { defineConfig } from "vitest/config";
import { SECTIONS, whatsappUrl } from "./src/content.ts";
import { renderSections } from "./src/render-sections.ts";

// As seções saem de src/content.ts direto no HTML: o texto existe sem JavaScript e sem WebGL.
function sectionsHtml(): Plugin {
  return {
    name: "marctco-sections",
    transformIndexHtml: (html) =>
      html
        .replace("<!--sections-->", renderSections())
        .replace("%WHATSAPP_URL%", whatsappUrl(SECTIONS[SECTIONS.length - 1]!.whatsappText).replace(/&/g, "&amp;")),
  };
}

export default defineConfig({
  plugins: [sectionsHtml()],
  build: {
    target: "es2022",
    // O chunk do three.js (~180 kB gzip) é esperado; o orçamento real é o check-budget.
    chunkSizeWarningLimit: 800,
    // three.js é a maior parte do bundle; separado, o cache sobrevive a mudanças no site.
    rollupOptions: { output: { manualChunks: (id) => (id.includes("node_modules/three") ? "three" : undefined) } },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
