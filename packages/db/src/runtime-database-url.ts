export type RuntimeProcessName = "web" | "worker";

export interface RuntimeDatabaseEndpoint {
  host: string;
  port: string;
  username: string;
  pgbouncer: string | undefined;
  query_keys: string[];
}

const SUPAVISOR_HOST_SUFFIX = ".pooler.supabase.com";
const SUPAVISOR_TRANSACTION_PORT = "6543";
const DEFAULT_POSTGRES_PORT = "5432";

export function describeRuntimeDatabaseUrl(
  database_url: string,
  process_name: RuntimeProcessName
): RuntimeDatabaseEndpoint {
  let url: URL;
  try {
    url = new URL(database_url);
  } catch {
    throw new Error(`${process_name}: DATABASE_URL is not a valid connection string`);
  }

  const query_keys = [...new Set(url.searchParams.keys())].sort();
  return {
    host: url.hostname,
    port: url.port === "" ? DEFAULT_POSTGRES_PORT : url.port,
    username: decodeURIComponent(url.username),
    pgbouncer: url.searchParams.get("pgbouncer") ?? undefined,
    query_keys
  };
}

export function formatRuntimeDatabaseEndpoint(endpoint: RuntimeDatabaseEndpoint): string {
  return [
    `host=${endpoint.host}`,
    `port=${endpoint.port}`,
    `username=${endpoint.username}`,
    `query_keys=[${endpoint.query_keys.join(",")}]`
  ].join(" ");
}

export function inspectRuntimeDatabaseUrl(
  database_url: string,
  process_name: RuntimeProcessName
): RuntimeDatabaseEndpoint {
  const endpoint = describeRuntimeDatabaseUrl(database_url, process_name);
  const on_supavisor = endpoint.host.endsWith(SUPAVISOR_HOST_SUFFIX);

  if (on_supavisor && !endpoint.username.includes(".")) {
    throw new Error(
      `${process_name}: Supavisor pooler username must be <role>.<project-ref>, so the pooler can route the tenant; ` +
        `an unqualified role authenticates against the pooler itself and is rejected (${formatRuntimeDatabaseEndpoint(endpoint)})`
    );
  }

  if (on_supavisor && endpoint.port === SUPAVISOR_TRANSACTION_PORT && endpoint.pgbouncer !== "true") {
    throw new Error(
      `${process_name}: Supavisor transaction mode requires pgbouncer=true in DATABASE_URL; without it Prisma reuses ` +
        `prepared statement names across pooled sessions and Postgres answers 42P05 (${formatRuntimeDatabaseEndpoint(endpoint)})`
    );
  }

  return endpoint;
}
