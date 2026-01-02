import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in the package root
dotenv.config({ path: join(__dirname, "..", "..", ".env") });

/**
 * Parses a comma-separated string into an array of integers.
 * @param {string} value - Comma-separated values
 * @param {number[]} defaultValue - Default array if parsing fails
 * @returns {number[]} Parsed array of integers
 */
function parseContextSteps(value, defaultValue) {
  if (!value) return defaultValue;
  try {
    return value.split(",").map((s) => parseInt(s.trim(), 10)).filter((n) => !isNaN(n) && n > 0);
  } catch {
    return defaultValue;
  }
}

/**
 * Application configuration loaded from environment variables.
 */
export const config = {
  lmstudio: {
    model: process.env.LMSTUDIO_MODEL || "YOUR_MODEL_ID_HERE",
    baseURL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    apiKey: process.env.LMSTUDIO_API_KEY || "lm-studio",
    startCommand: process.env.LMSTUDIO_START_COMMAND,
    // Model loading options
    loadModel: process.env.LMSTUDIO_LOAD_MODEL !== "false", // Default: true
    gpu: process.env.LMSTUDIO_GPU || "auto", // "max", "auto" (use default), or 0.0-1.0
    contextLength: process.env.LMSTUDIO_CONTEXT_LENGTH, // Optional: 1-N
    modelIdentifier: process.env.LMSTUDIO_MODEL_IDENTIFIER, // Optional: custom identifier
    // Dynamic context reloading options
    defaultContext: parseInt(process.env.LMSTUDIO_DEFAULT_CONTEXT || "4096", 10),
    contextSteps: parseContextSteps(process.env.LMSTUDIO_CONTEXT_STEPS, [4096, 8192, 16384, 32768]),
    tokenBuffer: parseInt(process.env.LMSTUDIO_TOKEN_BUFFER || "350", 10),
  },
  commit: {
    temperature: parseFloat(process.env.COMMIT_TEMPERATURE || "0.3"),
  },
};

/**
 * Validates required environment variables.
 * @throws {Error} If required variables are missing
 */
export function validateConfig() {
  if (!config.lmstudio.model || config.lmstudio.model === "YOUR_MODEL_ID_HERE") {
    throw new Error(
      "LMSTUDIO_MODEL environment variable is not set.\n" +
      "Please set it to your model ID, e.g.:\n" +
      "  export LMSTUDIO_MODEL='your-model-id'"
    );
  }
}
