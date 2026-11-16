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
  -h, --help     Show this help message

Backends:
  Ollama is used when it is reachable. Otherwise the tool falls back to LM Studio,
  starting it if needed and using a model it already has loaded.

Environment Variables (Ollama):
  OLLAMA_MODEL              Model ID (default: qwen3:4b)
  OLLAMA_BASE_URL           API base URL (default: http://127.0.0.1:11434/v1)
  OLLAMA_API_KEY            Sent as a Bearer token; Ollama does not need one (default: ollama)
  OLLAMA_CONTEXT_STEPS      Comma-separated num_ctx sizes to choose from (default: 4096,8192,16384,32768)
  OLLAMA_TOKEN_BUFFER       Tokens reserved on top of the diff when sizing num_ctx (default: 350)

Environment Variables (LM Studio):
  LMSTUDIO_MODEL            Model to load when none is loaded (default: qwen3.5-4b)
  LMSTUDIO_BASE_URL         API base URL (default: http://localhost:1234/v1)
  LMSTUDIO_API_KEY          API key (default: lm-studio)
  LMSTUDIO_START_COMMAND    Command to start LM Studio if not running, or "false" to disable
                            (default: uses 'lms server start' if available, else GUI)
  LMSTUDIO_LOAD_MODEL       Auto-load model via CLI (default: true, set to "false" to disable)
  LMSTUDIO_GPU              GPU offload: "max" or 0.0-1.0 (default: "auto" = use LM Studio default)
  LMSTUDIO_CONTEXT_LENGTH   Context length for model (optional: 1-N)
  LMSTUDIO_MODEL_IDENTIFIER Custom identifier for the model (optional)
  LMSTUDIO_DEFAULT_CONTEXT  Context assumed when LM Studio does not report one (default: 4096)
  LMSTUDIO_CONTEXT_STEPS    Context sizes the model may be reloaded with (default: 4096,8192,16384,32768)
  LMSTUDIO_TOKEN_BUFFER     Tokens reserved on top of the diff when sizing context (default: 350)

Environment Variables (both):
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
