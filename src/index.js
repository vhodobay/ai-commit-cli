#!/usr/bin/env node

import { execSync, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import OpenAI from "openai";
import dotenv from "dotenv";

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in the package root
dotenv.config({ path: join(__dirname, "..", ".env") });

/**
 * Gets the staged git diff.
 * @returns {string} The staged diff output
 * @throws {Error} If not in a git repository or git command fails
 */
function getStagedDiff() {
  try {
    const diff = execSync("git diff --cached", { encoding: "utf8" });
    return diff.trim();
  } catch (error) {
    if (error.status === 128) {
      throw new Error("Not in a git repository");
    }
    throw new Error(`Failed to get git diff: ${error.message}`);
  }
}

/**
 * Displays help information.
 */
function showHelp() {
  console.log(`
ai-commit - AI-powered Git commit message generator

Usage:
  ai-commit [options]

Options:
  --no-commit    Show suggested message without committing
  --help         Show this help message

Environment Variables:
  LMSTUDIO_MODEL     Model ID to use (required)
  LMSTUDIO_BASE_URL  API base URL (default: http://localhost:1234/v1)
  LMSTUDIO_API_KEY   API key (default: lm-studio)
  COMMIT_TEMPERATURE Temperature for generation (default: 0.3)
  `.trim());
  process.exit(0);
}

/**
 * Prompts user for confirmation with a timeout.
 * @param {string} question - The question to ask
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if user confirmed
 */
function promptConfirmation(question, timeout = 30000) {
  return new Promise((resolve) => {
    if (!process.stdin.isTTY) {
      console.log("Non-interactive environment detected, aborting.");
      resolve(false);
      return;
    }

    const timer = setTimeout(() => {
      console.log("\nTimeout reached. Aborting.");
      cleanup();
      resolve(false);
    }, timeout);

    const cleanup = () => {
      clearTimeout(timer);
      process.stdin.pause();
      process.stdin.removeAllListeners("data");
    };

    process.stdout.write(question);
    process.stdin.setEncoding("utf8");
    process.stdin.once("data", (data) => {
      cleanup();
      const answer = data.trim().toLowerCase();
      resolve(answer === "y" || answer === "yes");
    });
  });
}

/**
 * Executes git commit with the provided message.
 * @param {string} commitMsg - The commit message
 * @throws {Error} If git commit fails
 */
function executeGitCommit(commitMsg) {
  // Use spawnSync with array arguments to prevent command injection
  const result = spawnSync("git", ["commit", "-m", commitMsg], {
    stdio: "inherit",
    encoding: "utf8",
  });

  if (result.error) {
    throw new Error(`Failed to execute git commit: ${result.error.message}`);
  }

  if (result.status !== 0) {
    throw new Error(`git commit failed with exit code ${result.status}`);
  }
}

async function main() {
  // Check for help flag
  if (process.argv.includes("--help") || process.argv.includes("-h")) {
    showHelp();
  }

  console.log("🔍 Checking for staged changes...");
  const diff = getStagedDiff();
  if (!diff) {
    console.error("❌ No staged changes found. Please stage your changes first with 'git add'.");
    process.exit(1);
  }

  console.log("✓ Found staged changes");
  console.log(`📊 Diff size: ${diff.length} characters\n`);

  const model = process.env.LMSTUDIO_MODEL || "YOUR_MODEL_ID_HERE";

  // Validate model configuration
  if (!model || model === "YOUR_MODEL_ID_HERE") {
    console.error("❌ Error: LMSTUDIO_MODEL environment variable is not set.");
    console.error("Please set it to your model ID, e.g.:");
    console.error("  export LMSTUDIO_MODEL='your-model-id'");
    process.exit(1);
  }

  console.log(`🤖 Using model: ${model}`);

  const systemPrompt = `
You write concise, high-quality Git commit messages.
Rules:
- Use a single-line summary, ~72 chars max.
- Use Conventional Commits where it makes sense (feat, fix, refactor, docs, test, chore, ci, perf, style).
- Focus on WHAT and WHY, not on filenames.
- Explain WHY the changes might have been made (best-effort inference).
- Output only the commit summary, no explanations.
`.trim();

  const userPrompt = `
Here is the staged diff:

${diff}
`.trim();

  const baseURL = process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1";
  const apiKey = process.env.LMSTUDIO_API_KEY || "lm-studio";
  const temperature = parseFloat(process.env.COMMIT_TEMPERATURE || "0.3");

  const client = new OpenAI({
    apiKey,
    baseURL,
  });

  let completion;
  try {
    console.log("🧠 Generating commit message...");
    completion = await client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature,
    });
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }

  // Validate API response
  if (!completion?.choices?.[0]?.message?.content) {
    throw new Error("Invalid API response: missing completion content");
  }

  const commitMsg = completion.choices[0].message.content.trim();

  console.log("\n📝 Suggested commit message:");
  console.log(`  ${commitMsg}\n`);

  // Optional interactive confirmation:
  if (process.argv.includes("--no-commit")) {
    console.log("ℹ️  Preview mode - not committing");
    process.exit(0);
  }

  const confirmed = await promptConfirmation("Use this commit message? [y/N] ");

  if (confirmed) {
    console.log("\n💾 Creating commit...");
    executeGitCommit(commitMsg);
    console.log("✅ Commit created successfully!");
  } else {
    console.log("\n❌ Aborted. You can copy/edit the message manually.");
  }
}

main().catch((err) => {
  console.error("ai-commit error:", err.message);
  process.exit(1);
});