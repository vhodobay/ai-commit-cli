import { spawn, spawnSync } from "node:child_process";
import { config } from "../config/env.js";
import { formatContextSize } from "../utils/tokens.js";

/** Cached result of the `lms` availability check; undefined until first checked. */
let lmsCliAvailable;

/**
 * Runs an `lms` CLI command. Never throws.
 * @param {string[]} args - Arguments for `lms`
 * @param {number} [timeout] - Timeout in milliseconds; none if omitted
 * @returns {{ok: boolean, stdout: string, stderr: string, error?: string}} Command outcome
 */
function runLms(args, timeout) {
  try {
    const result = spawnSync("lms", args, { encoding: "utf8", stdio: "pipe", timeout });
    return {
      ok: result.status === 0,
      stdout: result.stdout || "",
      stderr: result.stderr || "",
      error: result.error?.message,
    };
  } catch (error) {
    return { ok: false, stdout: "", stderr: "", error: error.message };
  }
}

/**
 * Builds the argument list for `lms load`. Pure: it does not print anything.
 * Flags are added in this order: context length, GPU, identifier.
 * An invalid GPU value is skipped and reported in `warnings` instead.
 * @param {string} modelId - The model ID to load
 * @param {{contextLength?: number|string, gpu?: string, identifier?: string}} [options] - Load options
 * @returns {{args: string[], warnings: string[]}} `args` for `lms`, and a warning message for each skipped option
 */
export function buildLoadArgs(modelId, { contextLength, gpu, identifier } = {}) {
  const args = ["load", modelId];
  const warnings = [];

  if (contextLength) {
    args.push(`--context-length=${contextLength}`);
  }

  // Only "max" or a number between 0.0 and 1.0 is valid for --gpu; "auto" means use the default
  if (gpu && gpu !== "auto") {
    const numValue = parseFloat(gpu);
    if (gpu.toLowerCase() === "max") {
      args.push("--gpu=max");
    } else if (!isNaN(numValue) && numValue >= 0.0 && numValue <= 1.0) {
      args.push(`--gpu=${numValue}`);
    } else {
      warnings.push(`Invalid GPU value "${gpu}", skipping --gpu option`);
    }
  }

  if (identifier) {
    args.push(`--identifier=${identifier}`);
  }

  return { args, warnings };
}

/**
 * Checks if the `lms` CLI is available. The result is cached for the process.
 * A negative result is not retried, which is acceptable for a short-lived CLI.
 * @returns {boolean} True if `lms` is available
 */
function isLMSCLIAvailable() {
  if (lmsCliAvailable === undefined) {
    lmsCliAvailable = runLms(["version"], 2000).ok;
  }
  return lmsCliAvailable;
}

/**
 * Clears the cached `lms` availability result so tests can check it again.
 * @internal
 */
export function _resetLmsCacheForTests() {
  lmsCliAvailable = undefined;
}

/**
 * Checks if a model is currently loaded using `lms ps`.
 * @param {string} modelId - The model ID to check for
 * @returns {boolean} True if the model is loaded
 */
function isModelLoaded(modelId) {
  const result = runLms(["ps"], 3000);
  if (!result.ok) {
    return false;
  }
  // The model might be listed by its full path or identifier
  return result.stdout.includes(modelId) || result.stdout.includes(config.lmstudio.modelIdentifier || modelId);
}

/**
 * Loads a model using `lms load` with configured options.
 * @param {string} modelId - The model ID to load
 * @throws {Error} If loading fails
 */
function loadModelWithCLI(modelId) {
  const { gpu, contextLength, modelIdentifier } = config.lmstudio;
  const { args, warnings } = buildLoadArgs(modelId, { contextLength, gpu, identifier: modelIdentifier });
  for (const w of warnings) {
    console.warn(`⚠️  ${w}`);
  }

  console.log(`📦 Loading model: ${modelId}...`);
  if (gpu && gpu !== "auto") {
    console.log(`   GPU: ${gpu}`);
  }
  if (contextLength) {
    console.log(`   Context length: ${contextLength}`);
  }

  // Model loading can take time
  const result = runLms(args, 60000);
  if (!result.ok) {
    throw new Error(`Failed to load model: ${result.stderr || result.stdout || result.error || "Unknown error"}`);
  }

  console.log("✓ Model loaded successfully");
}

/**
 * Checks if the LM Studio API is accessible.
 * @param {string} baseURL - The API base URL
 * @returns {Promise<boolean>} True if the models endpoint responds OK
 */
export async function checkLMStudioAccessible(baseURL) {
  try {
    const response = await fetch(`${baseURL}/models`, {
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
 * Starts a process detached from this one so the CLI can exit without waiting for it.
 * Synchronous spawn failures throw. Asynchronous ones (such as ENOENT) are logged, and
 * `waitForLMStudio` then times out with its normal message.
 * @param {string} command - Command or executable to run
 * @param {string[]} args - Arguments for the command
 * @param {import("node:child_process").SpawnOptions} options - Extra spawn options
 * @throws {Error} If the process cannot be started synchronously
 */
function spawnDetached(command, args, options) {
  try {
    const child = spawn(command, args, { detached: true, stdio: "ignore", ...options });
    child.on("error", (err) => console.warn(`⚠️  Failed to start LM Studio: ${err.message}`));
    child.unref();
  } catch (error) {
    throw new Error(`Failed to start LM Studio: ${error.message}`);
  }
}

/**
 * Starts LM Studio using the configured command.
 * Prefers `lms server start` (faster, headless) over GUI application.
 * @internal
 * @param {string} startCommand - Command to start LM Studio; empty to use the platform default
 * @throws {Error} If a synchronous spawn failure occurs. Asynchronous spawn failures are logged, not thrown.
 */
export async function startLMStudio(startCommand) {
  if (!startCommand) {
    if (isLMSCLIAvailable()) {
      console.log("🚀 Starting LM Studio server with `lms server start` (headless mode)...");
      // Runs to completion; `lms server start` returns quickly once the server is up
      if (runLms(["server", "start"]).ok) {
        return;
      }
      console.log("⚠️  `lms server start` failed, falling back to GUI application...");
    }

    if (process.platform === "darwin") {
      spawnDetached("open", ["-a", "LM Studio"], {});
      console.log("🚀 Starting LM Studio GUI application...");
      return;
    }
    startCommand = process.platform === "win32" ? "start lmstudio" : "lmstudio";
  }

  console.log(`🚀 Starting LM Studio with: ${startCommand}`);
  // Shell execution handles quotes and complex commands
  spawnDetached(startCommand, [], { shell: true });
}

/**
 * Pauses for the given time.
 * @param {number} ms - Milliseconds to wait
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
    await sleep(checkInterval);
    process.stdout.write(".");
  }

  console.log("\n❌ LM Studio did not become accessible in time");
  return false;
}

/**
 * Ensures LM Studio is running and the model is loaded.
 * @param {string} baseURL - The API base URL
 * @throws {Error} If LM Studio cannot be started or accessed
 */
export async function ensureLMStudioRunning(baseURL) {
  console.log("🔍 Checking if LM Studio is running...");

  const wasAlreadyRunning = await checkLMStudioAccessible(baseURL);

  if (!wasAlreadyRunning) {
    console.log("⚠️  LM Studio is not running");

    const startCommand = config.lmstudio.startCommand;
    if (startCommand === "false" || startCommand === "0") {
      throw new Error(
        "LM Studio is not running and auto-start is disabled. " +
          "Please start LM Studio manually or set LMSTUDIO_START_COMMAND."
      );
    }

    await startLMStudio(startCommand);
    const isReady = await waitForLMStudio(baseURL);

    if (!isReady) {
      throw new Error(
        "LM Studio did not start in time. " +
          "Please ensure LM Studio is installed and the start command is correct. " +
          "Set LMSTUDIO_START_COMMAND to customize the start command."
      );
    }
  } else {
    console.log("✓ LM Studio is already running");
  }

  // Check if model loading is enabled and if we should load the model
  if (config.lmstudio.loadModel && config.lmstudio.model && config.lmstudio.model !== "YOUR_MODEL_ID_HERE") {
    if (isLMSCLIAvailable()) {
      if (!isModelLoaded(config.lmstudio.model)) {
        console.log("⚠️  Model is not loaded");
        try {
          loadModelWithCLI(config.lmstudio.model);
        } catch (error) {
          console.warn(`⚠️  Failed to load model automatically: ${error.message}`);
          console.warn("   You may need to load the model manually or it may already be loaded via GUI");
        }
      } else {
        console.log("✓ Model is already loaded");
      }
    } else {
      // If CLI is not available, assume model might be loaded via GUI
      console.log("ℹ️  `lms` CLI not available - skipping automatic model loading");
      console.log("   If using GUI, ensure the model is loaded manually");
    }
  }
}

/**
 * Gets information about the currently loaded model.
 * @returns {Promise<{id: string, contextSize: number}|null>} Model info or null if not available
 */
export async function getLoadedModelInfo() {
  try {
    // /v1/models omits context info; LM Studio's native /api/v0/models has loaded_context_length
    const modelsURL = `${config.lmstudio.baseURL.replace(/\/v1\/?$/, "")}/api/v0/models`;
    const response = await fetch(modelsURL, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${config.lmstudio.apiKey}`,
      },
      signal: AbortSignal.timeout(5000),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    if (!data?.data?.length) {
      return null;
    }

    // Find the configured model or use the first loaded one
    const modelId = config.lmstudio.model;
    const model = data.data.find((m) => m.id === modelId) || data.data.find((m) => m.state === "loaded") || data.data[0];

    return {
      id: model.id,
      // Absent when the model is not loaded; the caller then reloads with the size it needs
      contextSize: model.loaded_context_length || config.lmstudio.defaultContext,
    };
  } catch (error) {
    console.warn(`⚠️  Could not get model info: ${error.message}`);
    return null;
  }
}

/**
 * Unloads a model using `lms unload`.
 * @param {string} modelId - The model ID to unload
 * @returns {boolean} True if unload succeeded
 */
function unloadModel(modelId) {
  return runLms(["unload", modelId], 30000).ok;
}

/**
 * Reloads a model with a specific context size.
 * Returns false without running `lms` if the context size is not a positive finite number.
 * @param {string} modelId - The model ID to reload
 * @param {number} contextSize - The new context size in tokens
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<boolean>} True if reload succeeded
 */
export async function reloadModelWithContext(modelId, contextSize, maxRetries = 3) {
  if (!(typeof contextSize === "number" && Number.isFinite(contextSize) && contextSize > 0)) {
    console.error(`❌ Cannot reload ${modelId}: invalid context size ${contextSize} (expected a positive number of tokens)`);
    return false;
  }

  console.log(`🔄 Reloading ${modelId} with ${formatContextSize(contextSize)} context...`);

  const { gpu, modelIdentifier } = config.lmstudio;
  const { args, warnings } = buildLoadArgs(modelId, { contextLength: contextSize, gpu, identifier: modelIdentifier });
  for (const w of warnings) {
    console.warn(`⚠️  ${w}`);
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    unloadModel(modelId);

    // Small delay to ensure clean unload
    await sleep(500);

    // Model loading with larger context can take longer
    const result = runLms(args, 120000);
    if (result.ok) {
      console.log(`✓ Model reloaded with ${formatContextSize(contextSize)} context`);
      return true;
    }

    const errorMsg = result.stderr || result.stdout || result.error || "Unknown error";
    console.warn(`⚠️  Reload attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);

    if (attempt < maxRetries) {
      console.log(`   Retrying in 2 seconds...`);
      await sleep(2000);
    }
  }

  console.error(`❌ Failed to reload model after ${maxRetries} attempts`);
  return false;
}
