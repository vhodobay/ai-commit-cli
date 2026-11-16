import { spawn, spawnSync } from "node:child_process";
import { config } from "../config/env.js";
import { formatTokenCount } from "../utils/tokens.js";

/**
 * Checks if the `lms` CLI tool is available.
 * @returns {Promise<boolean>} True if `lms` is available
 */
async function isLMSCLIAvailable() {
  try {
    // Try running `lms version` to check if CLI is available
    const result = spawnSync("lms", ["version"], {
      encoding: "utf8",
      timeout: 2000,
    });
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Checks LM Studio server status using the `lms` CLI.
 * @returns {Promise<boolean>} True if server is running
 */
async function checkServerStatusWithCLI() {
  try {
    const result = spawnSync("lms", ["server", "status"], {
      encoding: "utf8",
      timeout: 2000,
    });
    // If command succeeds, server is likely running
    // The status command returns 0 if server is running
    return result.status === 0;
  } catch (error) {
    return false;
  }
}

/**
 * Checks if a model is currently loaded using `lms ps`.
 * @param {string} modelId - The model ID to check for
 * @returns {Promise<boolean>} True if the model is loaded
 */
async function isModelLoaded(modelId) {
  try {
    const result = spawnSync("lms", ["ps"], {
      encoding: "utf8",
      timeout: 3000,
    });
    
    if (result.status !== 0) {
      return false;
    }
    
    // Check if the model ID appears in the output
    const output = result.stdout || "";
    // The model might be listed by its full path or identifier
    return output.includes(modelId) || output.includes(config.lmstudio.modelIdentifier || modelId);
  } catch (error) {
    return false;
  }
}

/**
 * Loads a model using `lms load` with configured options.
 * @param {string} modelId - The model ID to load
 * @throws {Error} If loading fails
 */
async function loadModelWithCLI(modelId) {
  const args = ["load", modelId];
  
  // Add GPU option - only if it's "max" or a valid number (0.0-1.0)
  // Skip if "auto" or empty, as "auto" is not a valid value for --gpu
  if (config.lmstudio.gpu && config.lmstudio.gpu !== "auto") {
    // Validate: must be "max" or a number between 0.0 and 1.0
    const gpuValue = config.lmstudio.gpu.toLowerCase();
    if (gpuValue === "max") {
      args.push(`--gpu=max`);
    } else {
      // Try to parse as a number
      const numValue = parseFloat(config.lmstudio.gpu);
      if (!isNaN(numValue) && numValue >= 0.0 && numValue <= 1.0) {
        args.push(`--gpu=${numValue}`);
      } else {
        console.warn(`⚠️  Invalid GPU value "${config.lmstudio.gpu}", skipping --gpu option`);
      }
    }
  }
  
  // Add context length option
  if (config.lmstudio.contextLength) {
    args.push(`--context-length=${config.lmstudio.contextLength}`);
  }
  
  // Add identifier option
  if (config.lmstudio.modelIdentifier) {
    args.push(`--identifier=${config.lmstudio.modelIdentifier}`);
  }
  
  console.log(`📦 Loading model: ${modelId}...`);
  if (config.lmstudio.gpu && config.lmstudio.gpu !== "auto") {
    console.log(`   GPU: ${config.lmstudio.gpu}`);
  }
  if (config.lmstudio.contextLength) {
    console.log(`   Context length: ${config.lmstudio.contextLength}`);
  }
  
  try {
    const result = spawnSync("lms", args, {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 60000, // Model loading can take time
    });
    
    if (result.status !== 0) {
      const errorMsg = result.stderr || result.stdout || "Unknown error";
      throw new Error(`Failed to load model: ${errorMsg}`);
    }
    
    console.log("✓ Model loaded successfully");
  } catch (error) {
    throw new Error(`Failed to load model: ${error.message}`);
  }
}

/**
 * Checks if LM Studio API is accessible.
 * @param {string} baseURL - The API base URL
 * @returns {Promise<boolean>} True if accessible
 */
export async function checkLMStudioAccessible(baseURL) {
  // First try the faster CLI status check if available
  const hasCLI = await isLMSCLIAvailable();
  if (hasCLI) {
    const cliStatus = await checkServerStatusWithCLI();
    if (cliStatus) {
      // Double-check with API call to ensure it's actually responding
      try {
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
  }

  // Fallback to direct API check
  try {
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
 * Prefers `lms server start` (faster, headless) over GUI application.
 * @param {string} startCommand - Command to start LM Studio
 * @throws {Error} If starting fails
 */
async function startLMStudio(startCommand) {
  // If no custom command specified, try to use `lms server start` first
  if (!startCommand) {
    const hasCLI = await isLMSCLIAvailable();
    if (hasCLI) {
      console.log("🚀 Starting LM Studio server with `lms server start` (headless mode)...");
      try {
        // Use spawnSync to wait for the command to complete
        // `lms server start` should return quickly after starting the server
        const result = spawnSync("lms", ["server", "start"], {
          encoding: "utf8",
          stdio: "pipe",
        });
        
        if (result.status === 0) {
          return; // Successfully started
        } else {
          // If lms server start fails, fall through to GUI fallback
          console.log("⚠️  `lms server start` failed, falling back to GUI application...");
        }
      } catch (error) {
        // If lms command fails, fall through to GUI fallback
        console.log("⚠️  `lms` CLI not working, falling back to GUI application...");
      }
    }

    // Fallback to GUI application
    if (process.platform === "darwin") {
      try {
        const child = spawn("open", ["-a", "LM Studio"], {
          detached: true,
          stdio: "ignore",
        });
        child.unref();
        console.log("🚀 Starting LM Studio GUI application...");
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

  // Custom command specified or fallback for non-macOS
  if (startCommand) {
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
    const hasCLI = await isLMSCLIAvailable();
    if (hasCLI) {
      const modelLoaded = await isModelLoaded(config.lmstudio.model);
      if (!modelLoaded) {
        console.log("⚠️  Model is not loaded");
        try {
          await loadModelWithCLI(config.lmstudio.model);
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
 * Unloads the currently loaded model using the CLI.
 * @param {string} modelId - The model ID to unload
 * @returns {Promise<boolean>} True if unload succeeded
 */
async function unloadModel(modelId) {
  try {
    const result = spawnSync("lms", ["unload", modelId], {
      encoding: "utf8",
      stdio: "pipe",
      timeout: 30000,
    });

    return result.status === 0;
  } catch (error) {
    console.warn(`⚠️  Failed to unload model: ${error.message}`);
    return false;
  }
}

/**
 * Reloads a model with a specific context size.
 * @param {string} modelId - The model ID to reload
 * @param {number} contextSize - The new context size
 * @param {number} maxRetries - Maximum number of retry attempts (default: 3)
 * @returns {Promise<boolean>} True if reload succeeded
 */
export async function reloadModelWithContext(modelId, contextSize, maxRetries = 3) {
  console.log(`🔄 Reloading ${modelId} with ${formatTokenCount(contextSize).replace("~", "")} context...`);

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      // Unload current model
      await unloadModel(modelId);

      // Small delay to ensure clean unload
      await new Promise((resolve) => setTimeout(resolve, 500));

      // Build load command arguments
      const args = ["load", modelId, `--context-length=${contextSize}`];

      // Add GPU option if configured
      if (config.lmstudio.gpu && config.lmstudio.gpu !== "auto") {
        const gpuValue = config.lmstudio.gpu.toLowerCase();
        if (gpuValue === "max") {
          args.push(`--gpu=max`);
        } else {
          const numValue = parseFloat(config.lmstudio.gpu);
          if (!isNaN(numValue) && numValue >= 0.0 && numValue <= 1.0) {
            args.push(`--gpu=${numValue}`);
          }
        }
      }

      // Add identifier option if configured
      if (config.lmstudio.modelIdentifier) {
        args.push(`--identifier=${config.lmstudio.modelIdentifier}`);
      }

      const result = spawnSync("lms", args, {
        encoding: "utf8",
        stdio: "pipe",
        timeout: 120000, // Model loading with larger context can take longer
      });

      if (result.status === 0) {
        console.log(`✓ Model reloaded with ${formatTokenCount(contextSize).replace("~", "")} context`);
        return true;
      }

      const errorMsg = result.stderr || result.stdout || "Unknown error";
      console.warn(`⚠️  Reload attempt ${attempt}/${maxRetries} failed: ${errorMsg}`);
    } catch (error) {
      console.warn(`⚠️  Reload attempt ${attempt}/${maxRetries} failed: ${error.message}`);
    }

    if (attempt < maxRetries) {
      console.log(`   Retrying in 2 seconds...`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }

  console.error(`❌ Failed to reload model after ${maxRetries} attempts`);
  return false;
}
