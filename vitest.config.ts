import { defineConfig } from "vitest/config";

// Separado do vite.config.ts: o plugin da Cloudflare sobe um servidor próprio e não roda no vitest.
export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
});
