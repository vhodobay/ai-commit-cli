import { test } from "node:test";
import assert from "node:assert/strict";
import { estimateTokenCount, findRequiredContext } from "../src/utils/tokens.js";

test("findRequiredContext picks the smallest step that fits tokens + buffer", () => {
  assert.equal(findRequiredContext(3000, 350, [4096, 8192]), 4096);
  assert.equal(findRequiredContext(4000, 350, [4096, 8192]), 8192);
});

test("findRequiredContext treats tokens + buffer == step as a fit", () => {
  assert.equal(findRequiredContext(3746, 350, [4096, 8192]), 4096);
  assert.equal(findRequiredContext(3747, 350, [4096, 8192]), 8192);
});

test("findRequiredContext returns null above the maximum step", () => {
  assert.equal(findRequiredContext(8000, 350, [4096, 8192]), null);
});

test("findRequiredContext does not require sorted steps", () => {
  assert.equal(findRequiredContext(3000, 350, [8192, 4096]), 4096);
});

test("estimateTokenCount rounds ~4 chars/token up and treats empty as 0", () => {
  assert.equal(estimateTokenCount("12345678"), 2);
  assert.equal(estimateTokenCount("123456789"), 3);
  assert.equal(estimateTokenCount(""), 0);
  assert.equal(estimateTokenCount(undefined), 0);
});
