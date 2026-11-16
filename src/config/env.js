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
  ollama: {
    // Ollama is preferred when available
    model: process.env.OLLAMA_MODEL || "qwen3:4b",
    // Use Ollama's OpenAI-compatible HTTP API by default
    baseURL: process.env.OLLAMA_BASE_URL || "http://127.0.0.1:11434/v1",
    // Ollama does not require an API key; it is sent as a Bearer token only for proxies that want one
    apiKey: process.env.OLLAMA_API_KEY || "ollama",
    // num_ctx is chosen per request from these steps (Ollama silently truncates beyond its default ~4k)
    contextSteps: parseContextSteps(process.env.OLLAMA_CONTEXT_STEPS, [4096, 8192, 16384, 32768]),
    tokenBuffer: parseInt(process.env.OLLAMA_TOKEN_BUFFER || "350", 10),
  },
  lmstudio: {
    model: process.env.LMSTUDIO_MODEL || "qwen3.5-4b",
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
