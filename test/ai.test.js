import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
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
