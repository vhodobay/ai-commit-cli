import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { config } from "../src/config/env.js";
import {
  buildLoadArgs,
  checkLMStudioAccessible,
  getLoadedModelInfo,
  reloadModelWithContext,
  startLMStudio,
  _resetLmsCacheForTests,
} from "../src/services/lmstudio.js";

const realFetch = globalThis.fetch;
const tempDirs = [];
let savedPath;

afterEach(() => {
  globalThis.fetch = realFetch;
  if (savedPath !== undefined) {
    process.env.PATH = savedPath;
    savedPath = undefined;
  }
  for (const dir of tempDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  _resetLmsCacheForTests();
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

/**
 * Puts a fake `lms` executable first on PATH. Every invocation is logged as one line of args.
 * `load` fails the first `failures` times, then succeeds.
 */
function makeLmsStub({ failures = 0 } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lms-stub-"));
  tempDirs.push(dir);
  const logFile = path.join(dir, "calls.log");
  const counterFile = path.join(dir, "failures-left");
  fs.writeFileSync(counterFile, String(failures));

  const script = `#!/bin/sh
echo "$*" >> "${logFile}"
if [ "$1" = "load" ]; then
  n=$(cat "${counterFile}")
  if [ "$n" -gt 0 ]; then
    echo $((n - 1)) > "${counterFile}"
    echo "simulated load failure" >&2
    exit 1
  fi
fi
exit 0
`;
  const lmsPath = path.join(dir, "lms");
  fs.writeFileSync(lmsPath, script, { mode: 0o755 });

  savedPath = process.env.PATH;
  process.env.PATH = `${dir}${path.delimiter}${savedPath}`;
  _resetLmsCacheForTests();

  return {
    calls() {
      if (!fs.existsSync(logFile)) return [];
      return fs.readFileSync(logFile, "utf8").split("\n").filter(Boolean);
    },
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

test("buildLoadArgs with only a model ID", () => {
  assert.deepEqual(buildLoadArgs("my-model"), { args: ["load", "my-model"], warnings: [] });
});

test("buildLoadArgs orders context length, gpu, then identifier", () => {
  const { args, warnings } = buildLoadArgs("my-model", { contextLength: 8192, gpu: "MAX", identifier: "chat" });

  assert.deepEqual(args, ["load", "my-model", "--context-length=8192", "--gpu=max", "--identifier=chat"]);
  assert.deepEqual(warnings, []);
});

test("buildLoadArgs passes a numeric gpu fraction through", () => {
  assert.deepEqual(buildLoadArgs("my-model", { gpu: "0.5" }).args, ["load", "my-model", "--gpu=0.5"]);
});

test("buildLoadArgs omits the gpu flag for 'auto'", () => {
  assert.deepEqual(buildLoadArgs("my-model", { gpu: "auto" }), { args: ["load", "my-model"], warnings: [] });
});

test("buildLoadArgs skips an invalid gpu value and returns a warning", () => {
  const { args, warnings } = buildLoadArgs("my-model", { gpu: "banana" });

  assert.deepEqual(args, ["load", "my-model"]);
  assert.equal(warnings.length, 1);
  assert.match(warnings[0], /banana/);
});

test("checkLMStudioAccessible is true when the models endpoint responds OK", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 200 });

  assert.equal(await checkLMStudioAccessible("http://localhost:1234/v1"), true);
});

test("checkLMStudioAccessible is false when the models endpoint responds with an error", async () => {
  globalThis.fetch = async () => new Response("{}", { status: 500 });

  assert.equal(await checkLMStudioAccessible("http://localhost:1234/v1"), false);
});

test(
  "reloadModelWithContext unloads, then loads with --context-length on the first try",
  { skip: process.platform === "win32" },
  async (t) => {
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "warn", () => {});
    const lms = makeLmsStub();

    const ok = await reloadModelWithContext("my-model", 8192);

    assert.equal(ok, true);
    const calls = lms.calls();
    assert.equal(calls[0], "unload my-model");
    const load = calls.find((c) => c.startsWith("load "));
    assert.ok(load, "expected a load call");
    assert.ok(load.split(" ").includes("--context-length=8192"), `load args were: ${load}`);
  }
);

test(
  "reloadModelWithContext retries after a failed load and succeeds on attempt 2",
  { skip: process.platform === "win32" },
  async (t) => {
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "warn", () => {});
    t.mock.method(console, "error", () => {});
    const lms = makeLmsStub({ failures: 1 });

    const ok = await reloadModelWithContext("my-model", 8192, 2);

    assert.equal(ok, true);
    const loadCalls = lms.calls().filter((c) => c.startsWith("load "));
    assert.equal(loadCalls.length, 2);
  }
);

test(
  "reloadModelWithContext returns false when every attempt fails",
  { skip: process.platform === "win32" },
  async (t) => {
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "warn", () => {});
    const errorMock = t.mock.method(console, "error", () => {});
    const lms = makeLmsStub({ failures: 100 });

    const ok = await reloadModelWithContext("my-model", 8192, 1);

    assert.equal(ok, false);
    assert.equal(lms.calls().filter((c) => c.startsWith("load ")).length, 1);
    assert.equal(errorMock.mock.callCount(), 1);
  }
);

for (const badSize of [0, undefined, -4096, NaN, Infinity]) {
  test(
    `reloadModelWithContext rejects context size ${String(badSize)} without calling lms`,
    { skip: process.platform === "win32" },
    async (t) => {
      t.mock.method(console, "log", () => {});
      const errorMock = t.mock.method(console, "error", () => {});
      const lms = makeLmsStub();

      const ok = await reloadModelWithContext("my-model", badSize);

      assert.equal(ok, false);
      assert.deepEqual(lms.calls(), []);
      assert.equal(errorMock.mock.callCount(), 1);
    }
  );
}

test(
  "startLMStudio with an empty startCommand uses `lms server start` and spawns nothing else",
  { skip: process.platform === "win32" },
  async (t) => {
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "warn", () => {});
    const lms = makeLmsStub();

    await startLMStudio("");

    assert.deepEqual(lms.calls(), ["version", "server start"]);
  }
);

test(
  "startLMStudio runs a custom start command without throwing",
  { skip: process.platform === "win32" },
  async (t) => {
    t.mock.method(console, "log", () => {});
    t.mock.method(console, "warn", () => {});
    const lms = makeLmsStub();

    await startLMStudio("true");

    assert.deepEqual(lms.calls(), []);
  }
);
