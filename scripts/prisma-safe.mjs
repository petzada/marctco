import { spawnSync } from "node:child_process";
import { isLocalDatabase, loadLocalEnvironment, requiredDatabaseUrl } from "./env.mjs";

loadLocalEnvironment();

const arguments_ = process.argv.slice(2);
const operation = arguments_.slice(0, 2).join(" ");
const database_url = requiredDatabaseUrl();
const local = isLocalDatabase(database_url);
const destructive_development_operation =
  operation === "migrate dev" ||
  operation === "migrate reset" ||
  operation === "db push" ||
  arguments_.includes("--force-reset");

if (destructive_development_operation && !local) {
  throw new Error(`${operation || "Prisma command"} is forbidden against a remote database`);
}

if (operation === "migrate deploy" && !local && process.env.ALLOW_REMOTE_MIGRATE_DEPLOY !== "true") {
  throw new Error("Remote migrate deploy requires ALLOW_REMOTE_MIGRATE_DEPLOY=true in the production job");
}

const pnpm = process.env.npm_execpath;
if (!pnpm) {
  throw new Error("pnpm executable path is unavailable");
}
const result = spawnSync(
  process.execPath,
  [pnpm, "--filter", "@marctco/db", "exec", "prisma", ...arguments_],
  { stdio: "inherit", env: process.env }
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
