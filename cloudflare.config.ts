import { bindings, defineConfig } from "cf/config";

// Worker do site: assets estáticos (build do Vite) e /api/leads, que grava o formulário
// de contato no D1. Publicado pelo CI no push da main (migrations aplicadas antes).
export default defineConfig({
  worker: {
    name: "marctco-site",
    compatibilityDate: "2026-09-21",
    entrypoint: "./src/worker/index.ts",
    observability: { enabled: true },
    // Só /api/* passa pelo código do Worker; o resto sai direto dos assets
    assets: { notFoundHandling: "single-page-application", runWorkerFirst: ["/api/*"] },
    env: {
      ASSETS: bindings.assets(),
      DB: bindings.d1({ name: "marctco-leads", id: "9e73d86c-f8c6-4dee-a0de-3faf263e6834" }),
    },
    domains: ["marct.co", "www.marct.co"],
  },
});
