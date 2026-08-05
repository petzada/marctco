import { existsSync } from "node:fs";
import { resolve } from "node:path";

export function loadLocalEnvironment() {
  const environment_file = resolve(process.cwd(), ".env");
  if (existsSync(environment_file)) {
    process.loadEnvFile(environment_file);
  }
}

export function requiredDatabaseUrl() {
  loadLocalEnvironment();
  const value = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!value) {
    throw new Error("DATABASE_URL or DIRECT_URL is required");
  }
  return value;
}

export function isLocalDatabase(database_url) {
  const hostname = new URL(database_url).hostname.toLowerCase();
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
}

