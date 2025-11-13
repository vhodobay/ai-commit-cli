#!/usr/bin/env node

import { execSync } from "node:child_process";
import OpenAI from "openai";

function getStagedDiff() {
  const diff = execSync("git diff --cached", { encoding: "utf8" });
  return diff.trim();
}

async function main() {
  const diff = getStagedDiff();
  if (!diff) {
    console.error("No staged changes. Stage something first.");
    process.exit(1);
  }

  const model = process.env.LMSTUDIO_MODEL || "YOUR_MODEL_ID_HERE";

  const systemPrompt = `
You write concise, high-quality Git commit messages.
Rules:
- Use a single-line summary, ~72 chars max.
- Use Conventional Commits where it makes sense (feat, fix, refactor, docs, test, chore, ci, perf, style).
- Focus on WHAT and WHY, not on filenames.
- Output only the commit summary, no explanations.
`.trim();

  const userPrompt = `
Here is the staged diff:

${diff}
`.trim();

  const baseURL = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";
  const apiKey = process.env.LMSTUDIO_API_KEY || "lm-studio";

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  const completion = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3,
  });

  const commitMsg = completion.choices[0].message.content.trim();

  console.log("\nSuggested commit message:");
  console.log(`  ${commitMsg}\n`);

  // Optional interactive confirmation:
  if (process.argv.includes("--no-commit")) {
    process.exit(0);
  }

  process.stdout.write("Use this commit message? [y/N] ");
  process.stdin.setEncoding("utf8");
  process.stdin.once("data", (data) => {
    const answer = data.trim().toLowerCase();
    if (answer === "y") {
      execSync(`git commit -m "${commitMsg.replace(/"/g, '\\"')}"`, {
        stdio: "inherit",
      });
    } else {
      console.log("\nAborted. You can copy/edit the message manually.");
    }
  });
}

main().catch((err) => {
  console.error("ai-commit error:", err.message);
  process.exit(1);
});