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
import {
  buildAntigravityProvider,
  parseAntigravityModelIds,
} from "../src/provider.js";
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

test("provider exposes guided reconnect without storing OpenClaw credentials", () => {
  const provider = buildAntigravityProvider();
  assert.deepEqual(provider.envVars, []);
  assert.equal(provider.auth.length, 1);
  assert.equal(provider.auth[0].id, "cli");
  assert.equal(provider.auth[0].kind, "custom");
  assert.equal(typeof provider.auth[0].run, "function");
  assert.equal(typeof provider.auth[0].appGuidedSetup.detectAvailability, "function");
  assert.equal(typeof provider.auth[0].appGuidedSetup.detect, "function");
  assert.equal(typeof provider.auth[0].appGuidedSetup.prepare, "function");
});

test("guided reconnect detects the preferred model through the configured agy command", async () => {
  const calls = [];
  const provider = buildAntigravityProvider(
    { command: "/opt/custom-agy" },
    {
      runCommand: async (command, args) => {
        calls.push([command, args]);
        return [
          "Fetching available models...",
          "gemini-3.8-flash-high\tGemini 3.8 Flash High",
          "gemini-3.1-pro-high\tGemini 3.1 Pro High",
          "gemini-3.1-pro-high\tDuplicate row",
        ].join("\n");
      },
    },
  );

  assert.deepEqual(await provider.auth[0].appGuidedSetup.detect({ config: {}, env: {} }), {
    modelRef: "antigravity-cli/gemini-3.1-pro-high",
    detail: "gemini-3.1-pro-high via agy",
  });
  assert.deepEqual(calls, [["/opt/custom-agy", ["models"]]]);
});

test("model discovery accepts tab- and space-separated agy output from either stream", () => {
  assert.deepEqual(
    parseAntigravityModelIds([
      "Fetching available models...",
      "gemini-3.8-flash-high\tGemini 3.8 Flash High",
      "claude-sonnet-4-6  Claude Sonnet 4.6",
      "gemini-3.8-flash-high Duplicate row",
      "not-a-model-row",
    ].join("\n")),
    ["gemini-3.8-flash-high", "claude-sonnet-4-6"],
  );
});

test("guided reconnect prepares only a model currently reported by agy", async () => {
  const provider = buildAntigravityProvider(
    {},
    {
      runCommand: async () =>
        "gemini-3.8-flash-high\tGemini 3.8 Flash High\nclaude-sonnet-4-6\tClaude Sonnet 4.6\n",
    },
  );
  const guided = provider.auth[0].appGuidedSetup;

  assert.deepEqual(
    await guided.prepare({
      config: {},
      env: {},
      modelRef: "antigravity-cli/claude-sonnet-4-6",
    }),
    {
      profiles: [],
      defaultModel: "antigravity-cli/claude-sonnet-4-6",
      configPatch: {
        models: {
          mode: "merge",
          providers: {
            "antigravity-cli": {
              baseUrl: ANTIGRAVITY_BASE_URL,
              api: ANTIGRAVITY_MODEL_API,
              models: buildAntigravityModelCatalog(),
            },
          },
        },
      },
    },
  );
  assert.equal(
    await guided.prepare({
      config: {},
      env: {},
      modelRef: "antigravity-cli/not-reported",
    }),
    null,
  );
  assert.equal(
    await guided.prepare({ config: {}, env: {}, modelRef: "other/claude-sonnet-4-6" }),
    null,
  );
});

test("guided reconnect reports unavailable agy without inventing a credential", async () => {
  const provider = buildAntigravityProvider(
    {},
    {
      runCommand: async () => {
        throw new Error("ENOENT");
      },
    },
  );
  const context = { config: {}, env: {} };

  assert.equal(await provider.auth[0].appGuidedSetup.detect(context), null);
  assert.equal(await provider.auth[0].appGuidedSetup.detectAvailability(context), false);
  await assert.rejects(
    provider.auth[0].run(context),
    /Run `agy` in a terminal to sign in, then choose Reconnect again/,
  );
});

test("guided reconnect propagates cancellation", async () => {
  const controller = new AbortController();
  const reason = new Error("cancelled by caller");
  controller.abort(reason);
  const provider = buildAntigravityProvider();

  await assert.rejects(
    provider.auth[0].appGuidedSetup.detect({
      config: {},
      env: {},
      signal: controller.signal,
    }),
    reason,
  );
});

test("interactive reconnect returns the CLI-owned model without storing auth", async () => {
  const provider = buildAntigravityProvider(
    {},
    { runCommand: async () => "gemini-3.1-pro-high\tGemini 3.1 Pro High\n" },
  );

  assert.deepEqual(await provider.auth[0].run({ config: {}, env: {} }), {
    profiles: [],
    defaultModel: "antigravity-cli/gemini-3.1-pro-high",
    configPatch: {
      models: {
        mode: "merge",
        providers: {
          "antigravity-cli": {
            baseUrl: ANTIGRAVITY_BASE_URL,
            api: ANTIGRAVITY_MODEL_API,
            models: buildAntigravityModelCatalog(),
          },
        },
      },
    },
  });
});

test("reconnect preserves explicit provider settings and mode while refreshing connection", async () => {
  const provider = buildAntigravityProvider(
    {},
    { runCommand: async () => "gemini-3.1-pro-high\tGemini 3.1 Pro High\n" },
  );
  const config = {
    models: {
      mode: "replace",
      providers: {
        "antigravity-cli": {
          baseUrl: "http://stale.invalid",
          label: "kept",
          timeoutSeconds: 90,
          params: { owner: "user" },
          models: [{ id: "pinned-model" }],
        },
      },
    },
  };

  const result = await provider.auth[0].run({ config, env: {} });

  assert.deepEqual(result.configPatch, {
    models: {
      mode: "replace",
      providers: {
        "antigravity-cli": {
          label: "kept",
          baseUrl: ANTIGRAVITY_BASE_URL,
          api: ANTIGRAVITY_MODEL_API,
          timeoutSeconds: 90,
          params: { owner: "user" },
          models: [{ id: "pinned-model" }],
        },
      },
    },
  });
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

test("catalog matches the model ids reported by agy 1.1.25", () => {
  assert.deepEqual(ANTIGRAVITY_MODEL_IDS, [
    "gemini-3.8-flash-high",
    "gemini-3.8-flash-medium",
    "gemini-3.8-flash-low",
    "gemini-3.7-flash-high",
    "gemini-3.7-flash-medium",
    "gemini-3.7-flash-low",
    "gemini-3.6-flash-high",
    "gemini-3.6-flash-medium",
    "gemini-3.6-flash-low",
    "gemini-3.1-pro-high",
    "gemini-3.1-pro-low",
    "claude-sonnet-4-6",
    "claude-opus-4-6-thinking",
    "gpt-oss-120b-medium",
  ]);
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

test("plugin gives Antigravity provider-scoped OpenClaw and mcporter guidance", () => {
  let hook;
  let registerHookCalled = false;
  plugin.register({
    registerProvider: () => {},
    registerCliBackend: () => {},
    registerHook: () => {
      registerHookCalled = true;
    },
    on: (name, handler) => {
      assert.equal(name, "before_prompt_build");
      hook = handler;
    },
  });

  assert.equal(registerHookCalled, false);
  assert.equal(typeof hook, "function");
  const guidance = hook({}, { modelProviderId: "antigravity-cli" });
  assert.match(guidance.prependContext, /openclaw/);
  assert.match(guidance.prependContext, /mcporter/);
  assert.equal(hook({}, { modelProviderId: "other-provider" }), undefined);
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
