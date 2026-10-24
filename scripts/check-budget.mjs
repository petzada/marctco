// Orçamento de desempenho (README): cena completa < 3 MB comprimida.
// Soma o gzip de tudo o que o build publica em dist/ e falha acima do limite.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";

const LIMIT = 3 * 1024 * 1024;
const files = (dir) =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : [path];
  });

let total = 0;
const rows = [];
// Com o plugin da Cloudflare (Node 22.18+) os assets saem na Build Output da Cloudflare;
// sem ele, direto em dist.
const root = [".cloudflare/output/v0/workers/default/assets", "dist"].find((dir) => existsSync(dir));
if (!root) {
  console.error("check-budget: nenhuma saída de build encontrada.");
  process.exit(1);
}
for (const path of files(root)) {
  const raw = readFileSync(path);
  // .glb já vem comprimido (Meshopt/Draco); gzip só nos textos
  const size = /\.(glb|png|jpe?g|webp|avif|ktx2)$/.test(path) ? raw.length : gzipSync(raw, { level: 9 }).length;
  total += size;
  rows.push([path, size]);
}
rows.sort((a, b) => b[1] - a[1]);
for (const [path, size] of rows.slice(0, 8)) console.log(`${(size / 1024).toFixed(1).padStart(8)} kB  ${path}`);
console.log(`total comprimido: ${(total / 1024).toFixed(1)} kB de ${(LIMIT / 1024).toFixed(0)} kB`);
if (total > LIMIT) {
  console.error("check-budget: acima do orçamento de 3 MB.");
  process.exit(1);
}
