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
}

if (failures.length > 0) {
  throw new Error(`Unsafe migration DDL detected:\n${failures.join("\n")}`);
}
console.log("Migration safety scan passed");

