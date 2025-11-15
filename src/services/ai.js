import OpenAI from "openai";
import { config } from "../config/env.js";

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
 * Generates a commit message from a git diff using AI.
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
    throw new Error(`API request failed: ${error.message}`);
  }

  // Validate API response
  if (!completion?.choices?.[0]?.message?.content) {
    throw new Error("Invalid API response: missing completion content");
  }

  return completion.choices[0].message.content.trim();
}
