import { spawnSync } from "node:child_process";

function run(command, arguments_, options = {}) {
  const executable = process.platform === "win32" && command === "git" ? "git.exe" : command;
  const result = spawnSync(executable, arguments_, {
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit"
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(`${command} ${arguments_.join(" ")} failed`);
  }
  return result;
}

const branch = run("git", ["branch", "--show-current"], { capture: true }).stdout.trim();
if (!branch || branch === "main") {
  throw new Error("pnpm ship must run from a ticket branch, never main");
}

for (const diff_arguments of [["diff", "--quiet"], ["diff", "--cached", "--quiet"]]) {
  const result = run("git", diff_arguments, { capture: true, allowFailure: true });
  if (result.status !== 0) {
    throw new Error("Commit tracked changes before pnpm ship");
  }
}

run("git", ["push", "--set-upstream", "origin", branch]);
const existing = run("gh", ["pr", "view", branch, "--json", "url", "--jq", ".url"], {
  capture: true,
  allowFailure: true
});
if (existing.status === 0) {
  console.log(existing.stdout.trim());
} else {
  run("gh", ["pr", "create", "--fill", "--base", "main", "--head", branch]);
}

