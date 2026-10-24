import { defineConfig } from "cf/config";

// Worker só de assets estáticos (o build do Vite). Publicado pelo CI no push da main.
export default defineConfig({
  worker: {
    name: "marctco-site",
    compatibilityDate: "2026-09-21",
    observability: { enabled: true },
    assets: { notFoundHandling: "single-page-application" },
    domains: ["marct.co", "www.marct.co"],
  },
});
