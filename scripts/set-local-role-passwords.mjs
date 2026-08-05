import { spawnSync } from "node:child_process";
import { isLocalDatabase, requiredDatabaseUrl } from "./env.mjs";

const database_url = requiredDatabaseUrl();
if (!isLocalDatabase(database_url)) {
  throw new Error("Local role password helper refuses remote databases");
}

const sql = [
  "ALTER ROLE marctco_migrator PASSWORD 'local-migrator-only'",
  "ALTER ROLE marctco_app PASSWORD 'local-app-only'",
  "ALTER ROLE marctco_worker PASSWORD 'local-worker-only'"
].join("; ");
const result = spawnSync(
  "docker",
  ["compose", "exec", "-T", "postgres", "psql", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "marctco", "-c", sql],
  { stdio: "inherit" }
);
if (result.error) {
  throw result.error;
}
process.exitCode = result.status ?? 1;
if (result.status === 0) {
  console.log("Local-only role passwords assigned outside migration history");
}
