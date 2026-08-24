import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrations_root = join(process.cwd(), "packages", "db", "prisma", "migrations");
const forbidden = [
  { name: "DELETE", pattern: /\bDELETE\s+FROM\b/i },
  { name: "TRUNCATE", pattern: /\bTRUNCATE(?:\s+TABLE)?\b/i },
  { name: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { name: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { name: "destructive type change", pattern: /\bALTER\s+COLUMN\s+[^;]+\s+TYPE\s+/i }
];

// On a managed Postgres the migrations run as a non-superuser that owns
// nothing: `marctco_migrator` owns every business table. A migration that
// touches one without `SET ROLE marctco_migrator` dies with "must be owner
// of table X" — and only `test:managed-migration` catches it, which is a
// database job away from whoever wrote the SQL. This turns it into a scan.
const ddl = /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TYPE|POLICY|VIEW|SEQUENCE|FUNCTION|TRIGGER)\b/i;
const assumes_migrator = /\bSET\s+ROLE\s+marctco_migrator\b/i;

const migrations = readdirSync(migrations_root, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

function readSql(name) {
  return readFileSync(join(migrations_root, name, "migration.sql"), "utf8")
    .replaceAll(/--.*$/gm, "")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "");
}

// Every table that ever received FORCE ROW LEVEL SECURITY, across the whole
// history — a later migration inherits it whether or not it mentions it.
const forced_rls = new Set();
for (const name of migrations) {
  for (const match of readSql(name).matchAll(
    /ALTER\s+TABLE\s+"?(\w+)"?\s+FORCE\s+ROW\s+LEVEL\s+SECURITY/gi
  )) {
    forced_rls.add(match[1]);
  }
}

/**
 * A backfill against a FORCE RLS table silently touches nothing.
 *
 * The policies name `marctco_app` and `marctco_worker`; migrations run as
 * `marctco_migrator`, which no policy covers. Under FORCE, not even the owner
 * is exempt, so `UPDATE` matches zero rows and reports success — while `ALTER
 * TABLE`, which RLS does not govern, goes on to see the rows that were never
 * touched. A backfill followed by `SET NOT NULL` fails in production and
 * passes in CI, because CI migrates an empty database.
 *
 * Ticket 19 shipped exactly that and broke the release. The cure is to drop
 * FORCE for the length of the backfill, which lets the owning role through,
 * and restore it in the same transaction.
 */
const dml = /\b(UPDATE|INSERT\s+INTO)\s+"?(\w+)"?/gi;

/**
 * Applied in production before this rule existed, so their checksums are frozen
 * and neither can be repaired in place. Both backfills touched zero rows there:
 *
 *   - `opportunity_first_contact_at` set `closed_at` on WON/LOST rows. Harmless
 *     so far, because the operation that produces WON/LOST is Fase 6 and no such
 *     row exists yet.
 *   - `opportunity_last_movement_at` set `last_movement_at = arrived_at`. Every
 *     Opportunity older than 2026-08-17 in production still has NULL there.
 *
 * Recorded as open work rather than waived — see `.scratch/aberto/`.
 */
const RLS_BACKFILL_GRANDFATHERED = new Set([
  "20260817010300_opportunity_first_contact_at",
  "20260817010400_opportunity_last_movement_at"
]);

const failures = [];
for (const name of migrations) {
  const sql = readSql(name);

  for (const rule of forbidden) {
    if (rule.pattern.test(sql)) {
      failures.push(`${name}: ${rule.name}`);
    }
  }

  if (ddl.test(sql) && !assumes_migrator.test(sql)) {
    failures.push(`${name}: DDL without SET ROLE marctco_migrator`);
  }

  for (const match of sql.matchAll(dml)) {
    const table = match[2];
    if (!forced_rls.has(table) || RLS_BACKFILL_GRANDFATHERED.has(name)) {
      continue;
    }
    const lifted = new RegExp(
      `ALTER\\s+TABLE\\s+"?${table}"?\\s+NO\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i"
    ).test(sql);
    const restored = new RegExp(
      `ALTER\\s+TABLE\\s+"?${table}"?\\s+FORCE\\s+ROW\\s+LEVEL\\s+SECURITY`,
      "i"
    ).test(sql);
    if (!lifted) {
      failures.push(
        `${name}: ${match[1].replace(/\s+/g, " ")} on ${table}, which has FORCE RLS, without lifting it — the backfill would touch zero rows and report success`
      );
    } else if (!restored) {
      failures.push(`${name}: lifts FORCE RLS on ${table} and never restores it`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Unsafe migration DDL detected:\n${[...new Set(failures)].join("\n")}`);
}
console.log("Migration safety scan passed");
