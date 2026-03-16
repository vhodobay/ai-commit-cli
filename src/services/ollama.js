import { config } from "../config/env.js";

/**
 * Checks if the Ollama OpenAI-compatible API is accessible.
 * @param {string} [baseURL] - The API base URL
 * @returns {Promise<boolean>} True if accessible
 */
export async function checkOllamaAvailable(baseURL = config.ollama.baseURL) {
  try {
    const modelsURL = `${baseURL}/models`;
    const response = await fetch(modelsURL, {
      method: "GET",
      // Ollama typically does not require an API key, but include one if configured
      headers: config.ollama.apiKey ? { Authorization: `Bearer ${config.ollama.apiKey}` } : {},
      signal: AbortSignal.timeout(2000),
    });
    return response.ok;
  } catch {
    return false;
  }
}

