/**
 * Displays help information.
 */
export function showHelp() {
  console.log(`
ai-commit - AI-powered Git commit message generator

Usage:
  ai-commit [options]

Options:
  --no-commit    Show suggested message without committing
  --help         Show this help message

Environment Variables:
  LMSTUDIO_MODEL            Model ID to use (required)
  LMSTUDIO_BASE_URL         API base URL (default: http://localhost:1234/v1)
  LMSTUDIO_API_KEY          API key (default: lm-studio)
  LMSTUDIO_START_COMMAND    Command to start LM Studio if not running
                            (default: uses 'lms server start' if available, else GUI)
  LMSTUDIO_LOAD_MODEL       Auto-load model via CLI (default: true, set to "false" to disable)
  LMSTUDIO_GPU              GPU offload: max, auto, or 0.0-1.0 (default: auto)
  LMSTUDIO_CONTEXT_LENGTH   Context length for model (optional: 1-N)
  LMSTUDIO_MODEL_IDENTIFIER Custom identifier for the model (optional)
  COMMIT_TEMPERATURE        Temperature for generation (default: 0.3)
  `.trim());
  process.exit(0);
}

/**
 * Prompts user for confirmation with a timeout.
 * @param {string} question - The question to ask
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Promise<boolean>} True if user confirmed
 */
export function promptConfirmation(question, timeout = 30000) {
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
