import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import { config } from "../src/config/env.js";
import { getLoadedModelInfo } from "../src/services/lmstudio.js";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

// Mirrors real LM Studio: /v1/models has no context info, /api/v0/models does.
function stubLMStudio(v0Models) {
  globalThis.fetch = async (url) => {
    const body = String(url).endsWith("/api/v0/models")
      ? { data: v0Models }
      : { data: v0Models.map(({ id }) => ({ id, object: "model", owned_by: "organization_owner" })) };
    return new Response(JSON.stringify(body), { status: 200 });
  };
}

test("getLoadedModelInfo reports the real loaded context, not the default", async () => {
  stubLMStudio([
    { id: "other", state: "not-loaded" },
    { id: config.lmstudio.model, state: "loaded", loaded_context_length: 16384 },
  ]);

  const info = await getLoadedModelInfo();

  assert.equal(info.id, config.lmstudio.model);
  assert.equal(info.contextSize, 16384);
});

test("getLoadedModelInfo falls back to the default when the model is not loaded", async () => {
  stubLMStudio([{ id: config.lmstudio.model, state: "not-loaded" }]);

  const info = await getLoadedModelInfo();

  assert.equal(info.contextSize, config.lmstudio.defaultContext);
});
