import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { getStagedDiff } from "../src/utils/git.js";

const git = (...args) => execFileSync("git", args, { stdio: "ignore" });
const origCwd = process.cwd();
let dir;

before(() => {
  dir = mkdtempSync(join(tmpdir(), "ai-commit-"));
  process.chdir(dir);
  git("init", "-q");
});

after(() => {
  process.chdir(origCwd);
  rmSync(dir, { recursive: true, force: true });
});

test("getStagedDiff handles diffs over 1 MB and skips lockfiles", () => {
  writeFileSync("big.txt", "x".repeat(2 * 1024 * 1024) + "\n");
  writeFileSync("package-lock.json", "{}\n");
  writeFileSync("block.js", "export {};\n");
  git("add", ".");

  const diff = getStagedDiff();

  assert.match(diff, /b\/big\.txt/);
  assert.match(diff, /b\/block\.js/); // "lock" substring in name must not be excluded
  assert.doesNotMatch(diff, /package-lock\.json/);
});
