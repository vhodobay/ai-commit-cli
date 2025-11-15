import { execSync, spawnSync } from "node:child_process";

/**
 * Gets the staged git diff.
 * @returns {string} The staged diff output
 * @throws {Error} If not in a git repository or git command fails
 */
export function getStagedDiff() {
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
 * Executes git commit with the provided message.
 * @param {string} commitMsg - The commit message
 * @throws {Error} If git commit fails
 */
export function executeGitCommit(commitMsg) {
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
