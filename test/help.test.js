import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";

const help = spawnSync("node", ["src/index.js", "--help"], { encoding: "utf8" }).stdout;
const envSource = fs.readFileSync("src/config/env.js", "utf8");
const envVars = [...new Set([...envSource.matchAll(/process\.env\.([A-Z_]+)/g)].map((m) => m[1]))];

test("--help documents every environment variable the config reads", () => {
  const missing = envVars.filter((name) => !help.includes(name));
  assert.deepEqual(missing, []);
});

test("--help lists the -h shortcut and does not call LMSTUDIO_MODEL required", () => {
  assert.match(help, /-h\b/);
  assert.doesNotMatch(help, /required/i);
});

test("--help explains that Ollama is preferred over LM Studio", () => {
  assert.match(help, /Ollama.*LM Studio/s);
});
