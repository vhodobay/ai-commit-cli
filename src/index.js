#!/usr/bin/env node

import { config, validateConfig } from "./config/env.js";
import { getStagedDiff, executeGitCommit } from "./utils/git.js";
import { showHelp, promptConfirmation } from "./utils/ui.js";
import { ensureLMStudioRunning } from "./services/lmstudio.js";
import { generateCommitMessage } from "./services/ai.js";

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

  // Validate configuration
  validateConfig();
  console.log(`🤖 Using model: ${config.lmstudio.model}`);

  // Ensure LM Studio is running before making API calls
  await ensureLMStudioRunning(config.lmstudio.baseURL);

  // Generate commit message
  const commitMsg = await generateCommitMessage(diff);

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
