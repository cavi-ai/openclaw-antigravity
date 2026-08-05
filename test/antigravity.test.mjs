import assert from "node:assert/strict";
import test from "node:test";
import { buildAntigravityCliBackend } from "../src/cli-backend.js";
import {
  ANTIGRAVITY_BASE_URL,
  ANTIGRAVITY_MODEL_API,
  ANTIGRAVITY_MODEL_IDS,
  buildAntigravityModelCatalog,
  labelForModelId,
} from "../src/models.js";
import { buildAntigravityProvider } from "../src/provider.js";
import { plugin } from "../src/index.js";

test("backend drives `agy` in print mode and parses its json result", () => {
  const { config } = buildAntigravityCliBackend();
  assert.equal(config.command, "agy");
  assert.equal(config.output, "json");
  assert.deepEqual(config.args.slice(0, 4), ["--print", "{prompt}", "--output-format", "json"]);
});

test("backend resumes agy by conversation id", () => {
  const { config } = buildAntigravityCliBackend();
  assert.deepEqual(config.sessionIdFields, ["conversation_id"]);
  assert.equal(config.sessionMode, "existing");
  const resume = config.resumeArgs;
  assert.equal(resume[resume.indexOf("--conversation") + 1], "{sessionId}");
});

test("backend serializes runs so concurrent turns cannot interleave one conversation", () => {
  assert.equal(buildAntigravityCliBackend().config.serialize, true);
});

test("backend owns direct antigravity-cli/<model> refs rather than aliasing a provider", () => {
  const backend = buildAntigravityCliBackend();
  assert.equal(backend.id, "antigravity-cli");
  assert.equal(backend.modelProvider, backend.id);
});

test("backend exposes short model aliases agy itself does not accept", () => {
  const { modelAliases } = buildAntigravityCliBackend().config;
  assert.equal(modelAliases.pro, "gemini-3.1-pro-high");
  assert.equal(modelAliases.opus, "claude-opus-4-6-thinking");
  for (const id of Object.values(modelAliases)) {
    assert.ok(ANTIGRAVITY_MODEL_IDS.includes(id), `alias target ${id} is not a real agy model`);
  }
});

test("provider carries no auth because agy holds the Antigravity session", () => {
  const provider = buildAntigravityProvider();
  assert.deepEqual(provider.auth, []);
  assert.deepEqual(provider.envVars, []);
});

test("missing-auth guidance points at agy login, not an OpenClaw API key", () => {
  const provider = buildAntigravityProvider();
  const message = provider.buildMissingAuthMessage();
  const hint = provider.buildAuthDoctorHint();
  assert.match(message, /agy/i);
  assert.match(message, /Antigravity/i);
  assert.doesNotMatch(message, /paste.*api key/i);
  assert.equal(hint, message);
});

test("provider catalog covers every listed agy model", async () => {
  const result = await buildAntigravityProvider().staticCatalog.run();
  const ids = result.provider.models.map((model) => model.id);
  assert.deepEqual(ids, ANTIGRAVITY_MODEL_IDS);
  assert.equal(result.provider.defaultModel, "gemini-3.1-pro-high");
  assert.equal(result.provider.baseUrl, ANTIGRAVITY_BASE_URL);
  assert.equal(result.provider.api, ANTIGRAVITY_MODEL_API);
  for (const model of result.provider.models) {
    assert.equal(model.api, ANTIGRAVITY_MODEL_API);
  }
});

test("dynamic models carry required catalog shape fields", () => {
  const model = buildAntigravityProvider().resolveDynamicModel({ modelId: "gemini-4-pro-high" });
  assert.equal(model.baseUrl, ANTIGRAVITY_BASE_URL);
  assert.equal(model.api, ANTIGRAVITY_MODEL_API);
});

test("catalog reports zero per-token cost because Antigravity bills by subscription", () => {
  for (const model of buildAntigravityModelCatalog()) {
    assert.deepEqual(model.cost, { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 });
  }
});

test("unknown model ids pass through instead of failing the run", () => {
  const model = buildAntigravityProvider().resolveDynamicModel({ modelId: "gemini-4-pro-high" });
  assert.equal(model.id, "gemini-4-pro-high");
  assert.equal(model.provider, "antigravity-cli");
});

test("resolveDynamicModel expands aliases and ignores empty ids", () => {
  const provider = buildAntigravityProvider();
  assert.equal(provider.resolveDynamicModel({ modelId: "opus" }).id, "claude-opus-4-6-thinking");
  assert.equal(provider.resolveDynamicModel({ modelId: "  " }), null);
});

test("labelForModelId renders effort tiers readably", () => {
  assert.equal(labelForModelId("gemini-3.1-pro-high"), "Gemini 3.1 Pro (high)");
  assert.equal(labelForModelId("claude-sonnet-4-6"), "Claude Sonnet 4 6");
  assert.equal(labelForModelId("gpt-oss-120b-medium"), "GPT OSS 120b (medium)");
});

test("plugin registers both the provider and the CLI backend under one id", () => {
  const calls = [];
  plugin.register({
    registerProvider: (p) => calls.push(["provider", p.id]),
    registerCliBackend: (b) => calls.push(["cli-backend", b.id]),
  });
  assert.deepEqual(calls, [
    ["provider", "antigravity-cli"],
    ["cli-backend", "antigravity-cli"],
  ]);
});

test("every configSchema option changes real behaviour", () => {
  const custom = buildAntigravityCliBackend({
    command: "/opt/agy",
    mode: "plan",
    skipPermissions: true,
  });
  assert.equal(custom.config.command, "/opt/agy");
  assert.equal(custom.config.args[custom.config.args.indexOf("--mode") + 1], "plan");
  assert.ok(custom.config.args.includes("--dangerously-skip-permissions"));
});

test("mode \"none\" omits --mode entirely", () => {
  const args = buildAntigravityCliBackend({ mode: "none" }).config.args;
  assert.ok(!args.includes("--mode"));
});

test("permissions are not skipped unless explicitly configured", () => {
  const args = buildAntigravityCliBackend().config.args;
  assert.ok(!args.includes("--dangerously-skip-permissions"));
});

test("plugin passes its config through to the backend", () => {
  let backend;
  plugin.register({
    pluginConfig: { command: "/opt/agy" },
    registerProvider: () => {},
    registerCliBackend: (b) => {
      backend = b;
    },
  });
  assert.equal(backend.config.command, "/opt/agy");
});
