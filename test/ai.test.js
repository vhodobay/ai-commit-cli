import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config/env.js";
import { generateCommitMessage } from "../src/services/ai.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function stubFetch() {
  const calls = [];
  globalThis.fetch = async (url, init) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ message: { content: " feat: ok " } }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };
  return calls;
}

test("ollama: sizes num_ctx to the diff via native /api/chat", async () => {
  const calls = stubFetch();
  const diff = "x".repeat(20_000); // ~5k tokens, over Ollama's ~4k default

  const msg = await generateCommitMessage(diff, "ollama");

  assert.equal(msg, "feat: ok");
  assert.match(calls[0].url, /\/api\/chat$/);
  assert.ok(calls[0].body.options.num_ctx >= 5_000);
});

test("ollama: fails clearly when the diff exceeds the largest context", async () => {
  const calls = stubFetch();

  await assert.rejects(
    generateCommitMessage("x".repeat(500_000), "ollama"),
    /exceeds maximum context/,
  );
  assert.equal(calls.length, 0);
});

// LM Studio: /api/v0/models reports a roomy loaded context so no reload is attempted.
function stubLMStudioChat(chatResponse) {
  const chatCalls = [];
  globalThis.fetch = async (url, init) => {
    if (String(url).endsWith("/api/v0/models")) {
      const data = [{ id: "chat-model", type: "llm", state: "loaded", loaded_context_length: 32768 }];
      return new Response(JSON.stringify({ data }), { status: 200 });
    }
    chatCalls.push({ url: String(url), init, body: JSON.parse(init.body) });
    return chatResponse();
  };
  return chatCalls;
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

test("lmstudio: POSTs to /chat/completions with the key, model and temperature", async () => {
  const calls = stubLMStudioChat(() => json({ choices: [{ message: { content: " feat: ok " } }] }));

  const msg = await generateCommitMessage("diff", "lmstudio", "chat-model");

  assert.equal(msg, "feat: ok");
  assert.equal(calls[0].url, `${config.lmstudio.baseURL}/chat/completions`);
  assert.equal(calls[0].init.headers.Authorization, `Bearer ${config.lmstudio.apiKey}`);
  assert.equal(calls[0].body.model, "chat-model");
  assert.equal(calls[0].body.temperature, config.commit.temperature);
});

test("lmstudio: an HTTP error mentioning context gets the context hint", async () => {
  stubLMStudioChat(() => new Response("Trying to keep more tokens than the context length", { status: 400 }));

  await assert.rejects(generateCommitMessage("diff", "lmstudio", "chat-model"), /Context error:.*\n.*LMSTUDIO_CONTEXT_STEPS/s);
});

test("lmstudio: any other HTTP error is reported as an API request failure", async () => {
  stubLMStudioChat(() => new Response("boom", { status: 500 }));

  await assert.rejects(generateCommitMessage("diff", "lmstudio", "chat-model"), /API request failed: 500 boom/);
});

test("lmstudio: a response without content is rejected", async () => {
  stubLMStudioChat(() => json({ choices: [] }));

  await assert.rejects(generateCommitMessage("diff", "lmstudio", "chat-model"), /Invalid API response/);
});
