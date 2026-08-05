import { spawnSync } from "node:child_process";
import { requiredDatabaseUrl } from "./env.mjs";

const database_url = requiredDatabaseUrl();
const pnpm = process.env.npm_execpath;
if (!pnpm) {
  throw new Error("pnpm executable path is unavailable");
}
const result = spawnSync(
  process.execPath,
  [
    pnpm,
    "--filter",
    "@marctco/db",
    "exec",
    "prisma",
    "migrate",
    "diff",
    "--from-url",
    database_url,
    "--to-schema-datamodel",
    "prisma/schema.prisma",
    "--exit-code"
  ],
  { stdio: "inherit", env: process.env }
);

if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
