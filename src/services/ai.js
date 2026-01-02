import OpenAI from "openai";
import { config } from "../config/env.js";
import { estimateTokenCount, findRequiredContext, formatTokenCount } from "../utils/tokens.js";
import { getLoadedModelInfo, reloadModelWithContext } from "./lmstudio.js";

/**
 * System prompt for commit message generation.
 */
const SYSTEM_PROMPT = `
You write concise, high-quality Git commit messages.
Rules:
- Use a single-line summary, ~72 chars max.
- Use Conventional Commits where it makes sense (feat, fix, refactor, docs, test, chore, ci, perf, style).
- Focus on WHAT and WHY, not on filenames.
- Explain WHY the changes might have been made (best-effort inference).
- Output only the commit summary, no explanations.
`.trim();

/**
 * Ensures the model has sufficient context for the given input.
 * @param {number} requiredTokens - The number of tokens needed
 * @param {number} currentContext - The current model context size
 * @returns {Promise<number>} The context size after any necessary reloading
 * @throws {Error} If the diff is too large for any available context size
 */
async function ensureSufficientContext(requiredTokens, currentContext) {
  const { contextSteps, tokenBuffer, model } = config.lmstudio;
  const totalRequired = requiredTokens + tokenBuffer;

  // Check if current context is sufficient
  if (currentContext >= totalRequired) {
    return currentContext;
  }

  // Find the smallest context size that fits
  const targetContext = findRequiredContext(requiredTokens, tokenBuffer, contextSteps);
  const maxContext = Math.max(...contextSteps);

  if (targetContext === null) {
    throw new Error(
      `Diff is ${formatTokenCount(requiredTokens)}, exceeds maximum context (${formatTokenCount(maxContext).replace("~", "")}).\n` +
      `Consider splitting your changes into smaller commits.`
    );
  }

  // Need to reload with larger context
  console.log(`📊 Diff requires ${formatTokenCount(requiredTokens)}, current context is ${formatTokenCount(currentContext).replace("~", "")}`);

  const reloaded = await reloadModelWithContext(model, targetContext);
  if (!reloaded) {
    throw new Error(
      `Failed to reload model with ${formatTokenCount(targetContext).replace("~", "")} context.\n` +
      `Please check LM Studio and try again.`
    );
  }

  return targetContext;
}

/**
 * Generates a commit message from a git diff using AI.
 * Automatically handles context size by reloading the model if needed.
 * @param {string} diff - The git diff to analyze
 * @returns {Promise<string>} The generated commit message
 * @throws {Error} If AI generation fails
 */
export async function generateCommitMessage(diff) {
  const client = new OpenAI({
    apiKey: config.lmstudio.apiKey,
    baseURL: config.lmstudio.baseURL,
  });

  const userPrompt = `
Here is the staged diff:

${diff}
`.trim();

  // Estimate tokens needed for the full prompt
  const systemTokens = estimateTokenCount(SYSTEM_PROMPT);
  const userTokens = estimateTokenCount(userPrompt);
  const totalInputTokens = systemTokens + userTokens;

  // Get current model info and ensure sufficient context
  const modelInfo = await getLoadedModelInfo();
  const currentContext = modelInfo?.contextSize || config.lmstudio.defaultContext;

  await ensureSufficientContext(totalInputTokens, currentContext);

  console.log("🧠 Generating commit message...");

  let completion;
  try {
    completion = await client.chat.completions.create({
      model: config.lmstudio.model,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      temperature: config.commit.temperature,
    });
  } catch (error) {
    // Check if this is a context-related error and provide helpful message
    if (error.message?.includes("context") || error.message?.includes("token")) {
      throw new Error(
        `Context error: ${error.message}\n` +
        `Try increasing LMSTUDIO_CONTEXT_STEPS or splitting your changes into smaller commits.`
      );
    }
    throw new Error(`API request failed: ${error.message}`);
  }

  // Validate API response
  if (!completion?.choices?.[0]?.message?.content) {
    throw new Error("Invalid API response: missing completion content");
  }

  return completion.choices[0].message.content.trim();
}
