import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const migrations_root = join(process.cwd(), "packages", "db", "prisma", "migrations");
const forbidden = [
  { name: "DELETE", pattern: /\bDELETE\s+FROM\b/i },
  { name: "TRUNCATE", pattern: /\bTRUNCATE(?:\s+TABLE)?\b/i },
  { name: "DROP COLUMN", pattern: /\bDROP\s+COLUMN\b/i },
  { name: "DROP TABLE", pattern: /\bDROP\s+TABLE\b/i },
  { name: "destructive type change", pattern: /\bALTER\s+COLUMN\s+[^;]+\s+TYPE\s+/i },
  // `to_regclass` reads like an existence check and is not one: on a schema the
  // caller lacks USAGE on it raises `permission denied` instead of returning
  // NULL. Against `auth`, which only exists on managed Supabase, that turns a
  // guard into the statement that kills the migration — and it passes locally
  // and in CI, where `auth` is absent. Use pg_catalog plus has_*_privilege.
  { name: "to_regclass on the auth schema", pattern: /\bto_regclass\s*\(\s*'auth\./i }
];

// On a managed Postgres the migrations run as a non-superuser that owns
// nothing: `marctco_migrator` owns every business table. A migration that
// touches one without `SET ROLE marctco_migrator` dies with "must be owner
// of table X" — and only `test:managed-migration` catches it, which is a
// database job away from whoever wrote the SQL. This turns it into a scan.
const ddl = /\b(?:CREATE|ALTER|DROP)\s+(?:TABLE|INDEX|TYPE|POLICY|VIEW|SEQUENCE|FUNCTION|TRIGGER)\b/i;
const assumes_migrator = /\bSET\s+ROLE\s+marctco_migrator\b/i;

const failures = [];
for (const directory of readdirSync(migrations_root, { withFileTypes: true })) {
  if (!directory.isDirectory()) {
    continue;
  }
  const migration_path = join(migrations_root, directory.name, "migration.sql");
  const sql = readFileSync(migration_path, "utf8")
    .replaceAll(/--.*$/gm, "")
    .replaceAll(/\/\*[\s\S]*?\*\//g, "");

  for (const rule of forbidden) {
    if (rule.pattern.test(sql)) {
      failures.push(`${directory.name}: ${rule.name}`);
    }
  }

  if (ddl.test(sql) && !assumes_migrator.test(sql)) {
    failures.push(`${directory.name}: DDL without SET ROLE marctco_migrator`);
  }
}

if (failures.length > 0) {
  throw new Error(`Unsafe migration DDL detected:\n${failures.join("\n")}`);
}
console.log("Migration safety scan passed");

