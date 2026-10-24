// Testes ligados ao diff do branch (pre-push do lefthook e `npm run test:related`).
// Compara com o merge-base do branch padrão do remoto e roda `vitest related --run` só
// nos arquivos de código alterados. Sem arquivos de código no diff, não roda nada.
// Argumentos extras vão direto para o vitest (ex.: --testTimeout=60000).
// `vitest related` não segue import() dinâmico: o CI roda a suíte completa.
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

function base() {
  for (const ref of ["origin/HEAD", "origin/main", "origin/master"]) {
    try {
      return git("merge-base", "HEAD", ref);
    } catch {
      // ref ausente: tenta a próxima
    }
  }
  return null;
}

const from = base();
if (!from) {
  console.log("test-related: sem branch padrão no remoto; nada a comparar.");
  process.exit(0);
}

const files = git("diff", "--name-only", "--diff-filter=d", from, "HEAD")
  .split("\n")
  .filter((f) => /\.(c|m)?(t|j)sx?$/.test(f) && existsSync(f));

if (files.length === 0) {
  console.log("test-related: nenhum arquivo de código no diff; testes pulados.");
  process.exit(0);
}

console.log(`test-related: ${files.length} arquivo(s) alterado(s) desde ${from.slice(0, 8)}.`);
const r = spawnSync(
  "npx",
  ["vitest", "related", "--run", "--passWithNoTests", ...process.argv.slice(2), ...files],
  { stdio: "inherit", shell: process.platform === "win32" },
);
process.exit(r.status ?? 1);
