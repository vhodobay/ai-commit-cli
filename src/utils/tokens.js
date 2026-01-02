/**
 * Token estimation utilities for context size management.
 */

/**
 * Estimates the token count for a given text using a simple heuristic.
 * Assumes approximately 4 characters per token (conservative estimate for code).
 * @param {string} text - The text to estimate tokens for
 * @returns {number} Estimated token count
 */
export function estimateTokenCount(text) {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

/**
 * Finds the smallest context size that can accommodate the required tokens.
 * @param {number} tokenCount - The number of tokens needed
 * @param {number} buffer - Additional tokens to reserve for system prompt and response
 * @param {number[]} contextSteps - Available context sizes in ascending order
 * @returns {number|null} The smallest sufficient context size, or null if none fit
 */
export function findRequiredContext(tokenCount, buffer, contextSteps) {
  const totalRequired = tokenCount + buffer;

  // Sort steps to ensure ascending order
  const sortedSteps = [...contextSteps].sort((a, b) => a - b);

  for (const contextSize of sortedSteps) {
    if (contextSize >= totalRequired) {
      return contextSize;
    }
  }

  return null; // No context size is large enough
}

/**
 * Formats a token count for display (e.g., "12.5k tokens").
 * @param {number} tokens - The token count
 * @returns {string} Formatted string
 */
export function formatTokenCount(tokens) {
  if (tokens >= 1000) {
    return `~${(tokens / 1000).toFixed(1)}k tokens`;
  }
  return `~${tokens} tokens`;
}
