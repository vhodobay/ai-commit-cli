import { spawn } from "node:child_process";
import { config } from "../config/env.js";

/**
 * Checks if LM Studio API is accessible.
 * @param {string} baseURL - The API base URL
 * @returns {Promise<boolean>} True if accessible
 */
export async function checkLMStudioAccessible(baseURL) {
  try {
    // Try to access the models endpoint as a lightweight check
    // baseURL already includes /v1, so we just append /models
    const modelsURL = `${baseURL}/models`;
    const response = await fetch(modelsURL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.lmstudio.apiKey}`,
      },
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch (error) {
    return false;
  }
}

/**
 * Starts LM Studio using the configured command.
 * @param {string} startCommand - Command to start LM Studio
 * @throws {Error} If starting fails
 */
function startLMStudio(startCommand) {
  if (!startCommand) {
    // Default command for macOS
    if (process.platform === "darwin") {
      // Use spawn with shell for macOS to handle app names with spaces
      try {
        const child = spawn("open", ["-a", "LM Studio"], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        console.log("🚀 Starting LM Studio...");
        return;
      } catch (error) {
        throw new Error(`Failed to start LM Studio: ${error.message}`);
      }
    } else if (process.platform === "win32") {
      startCommand = "start lmstudio";
    } else {
      startCommand = "lmstudio";
    }
  }

  console.log(`🚀 Starting LM Studio with: ${startCommand}`);

  try {
    // Use shell execution for custom commands to handle quotes and complex commands
    const child = spawn(startCommand, {
      shell: true,
      detached: true,
      stdio: "ignore",
    });
    child.unref(); // Allow the parent process to exit independently
  } catch (error) {
    throw new Error(`Failed to start LM Studio: ${error.message}`);
  }
}

/**
 * Waits for LM Studio to become accessible.
 * @param {string} baseURL - The API base URL
 * @param {number} maxWaitTime - Maximum time to wait in milliseconds
 * @param {number} checkInterval - Interval between checks in milliseconds
 * @returns {Promise<boolean>} True if LM Studio became accessible
 */
async function waitForLMStudio(baseURL, maxWaitTime = 30000, checkInterval = 1000) {
  const startTime = Date.now();
  console.log("⏳ Waiting for LM Studio to start...");

  while (Date.now() - startTime < maxWaitTime) {
    if (await checkLMStudioAccessible(baseURL)) {
      console.log("✓ LM Studio is ready");
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, checkInterval));
    process.stdout.write(".");
  }

  console.log("\n❌ LM Studio did not become accessible in time");
  return false;
}

/**
 * Ensures LM Studio is running, starting it if necessary.
 * @param {string} baseURL - The API base URL
 * @throws {Error} If LM Studio cannot be started or accessed
 */
export async function ensureLMStudioRunning(baseURL) {
  console.log("🔍 Checking if LM Studio is running...");

  if (await checkLMStudioAccessible(baseURL)) {
    console.log("✓ LM Studio is already running");
    return;
  }

  console.log("⚠️  LM Studio is not running");

  const startCommand = config.lmstudio.startCommand;
  if (startCommand === "false" || startCommand === "0") {
    throw new Error(
      "LM Studio is not running and auto-start is disabled. " +
        "Please start LM Studio manually or set LMSTUDIO_START_COMMAND."
    );
  }

  startLMStudio(startCommand);
  const isReady = await waitForLMStudio(baseURL);

  if (!isReady) {
    throw new Error(
      "LM Studio did not start in time. " +
        "Please ensure LM Studio is installed and the start command is correct. " +
        "Set LMSTUDIO_START_COMMAND to customize the start command."
    );
  }
}
