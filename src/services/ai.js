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
 * Calls Ollama's native /api/chat, the only route that honors options.num_ctx.
 * The OpenAI-compatible route would silently truncate a diff larger than the default context.
 * @param {string} userPrompt - The user prompt containing the diff
 * @returns {Promise<string|undefined>} The raw completion content
 * @throws {Error} If the diff exceeds the largest context step or the request fails
 */
async function ollamaChat(userPrompt) {
  const { model, baseURL, apiKey, contextSteps, tokenBuffer } = config.ollama;
  const requiredTokens = estimateTokenCount(SYSTEM_PROMPT) + estimateTokenCount(userPrompt);
  const numCtx = findRequiredContext(requiredTokens, tokenBuffer, contextSteps);

  if (numCtx === null) {
    throw new Error(
      `Diff is ${formatTokenCount(requiredTokens)}, exceeds maximum context (${formatTokenCount(Math.max(...contextSteps)).replace("~", "")}).\n` +
      `Consider splitting your changes into smaller commits.`
    );
  }

  let response;
  try {
    response = await fetch(`${baseURL.replace(/\/v1\/?$/, "")}/api/chat`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        stream: false,
        messages: [
          { role: "system", content: SYSTEM_PROMPT },
          { role: "user", content: userPrompt },
        ],
        options: { temperature: config.commit.temperature, num_ctx: numCtx },
      }),
    });
  } catch (error) {
    throw new Error(`API request failed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`API request failed: ${response.status} ${await response.text()}`);
  }
  return (await response.json())?.message?.content;
}

/**
 * Generates a commit message from a git diff using AI.
 * Automatically handles context size by reloading the model if needed.
 * @param {string} diff - The git diff to analyze
 * @param {"ollama"|"lmstudio"} backend - Which backend to use
 * @returns {Promise<string>} The generated commit message
 * @throws {Error} If AI generation fails
 */
export async function generateCommitMessage(diff, backend = "lmstudio") {
  const isOllama = backend === "ollama";

  const userPrompt = `
Here is the staged diff:

${diff}
`.trim();

  // Ollama sizes num_ctx per request (native API); LM Studio reloads the model with a larger context.
  if (isOllama) {
    console.log("🧠 Generating commit message...");
    const content = await ollamaChat(userPrompt);
    if (!content) {
      throw new Error("Invalid API response: missing completion content");
    }
    return content.trim();
  }

  const client = new OpenAI({
    apiKey: config.lmstudio.apiKey,
    baseURL: config.lmstudio.baseURL,
  });

  const systemTokens = estimateTokenCount(SYSTEM_PROMPT);
  const userTokens = estimateTokenCount(userPrompt);
  const totalInputTokens = systemTokens + userTokens;

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
      const hint = "Try increasing LMSTUDIO_CONTEXT_STEPS or splitting your changes into smaller commits.";
      throw new Error(`Context error: ${error.message}\n${hint}`);
    }
    throw new Error(`API request failed: ${error.message}`);
  }

  // Validate API response
  if (!completion?.choices?.[0]?.message?.content) {
    throw new Error("Invalid API response: missing completion content");
  }

  return completion.choices[0].message.content.trim();
}
