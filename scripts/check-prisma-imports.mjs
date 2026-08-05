import { readFileSync, readdirSync } from "node:fs";
import { extname, join, relative } from "node:path";

const repository_root = process.cwd();
const ignored_directories = new Set([
  ".agents",
  ".claude",
  ".git",
  ".next",
  ".scratch",
  "dist",
  "node_modules",
  "generated"
]);
const forbidden_patterns = [
  /from\s+["']@prisma\/client["']/,
  /from\s+["'][^"']*packages\/db\/src\/client[^"']*["']/,
  /from\s+["']@marctco\/db\/src\//
];
const failures = [];

function visit(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === "PROMPT-GOAL-IMPLEMENTACAO.md") {
      continue;
    }
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!ignored_directories.has(entry.name)) {
        visit(path);
      }
      continue;
    }
    if (![".ts", ".tsx", ".mts", ".cts"].includes(extname(entry.name))) {
      continue;
    }
    const repository_path = relative(repository_root, path).replaceAll("\\", "/");
    if (repository_path.startsWith("packages/db/")) {
      continue;
    }
    const source = readFileSync(path, "utf8");
    if (forbidden_patterns.some((pattern) => pattern.test(source))) {
      failures.push(repository_path);
    }
  }
}

visit(repository_root);
if (failures.length > 0) {
  throw new Error(`Raw Prisma Client import outside packages/db:\n${failures.join("\n")}`);
}
console.log("Prisma import boundary passed");
