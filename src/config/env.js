import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";

// Get the directory where this script is located
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file in the package root
dotenv.config({ path: join(__dirname, "..", "..", ".env") });

/**
 * Application configuration loaded from environment variables.
 */
export const config = {
  lmstudio: {
    model: process.env.LMSTUDIO_MODEL || "YOUR_MODEL_ID_HERE",
    baseURL: process.env.LMSTUDIO_BASE_URL || "http://localhost:1234/v1",
    apiKey: process.env.LMSTUDIO_API_KEY || "lm-studio",
    startCommand: process.env.LMSTUDIO_START_COMMAND,
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
