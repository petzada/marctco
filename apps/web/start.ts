import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assertSafeDatabaseRole } from "@marctco/db";

await assertSafeDatabaseRole({ process_name: "web" });

const app_directory = fileURLToPath(new URL("..", import.meta.url));
const repository_root = resolve(app_directory, "../..");
const standalone = process.env.MARCTCO_NEXT_STANDALONE === "true";
const entry = standalone
  ? resolve(repository_root, "apps/web/server.js")
  : resolve(app_directory, "node_modules/next/dist/bin/next");
const arguments_ = standalone ? [entry] : [entry, "start"];
const server = spawn(process.execPath, arguments_, {
  cwd: repository_root,
  env: process.env,
  stdio: "inherit"
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.kill(signal));
}

server.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});

