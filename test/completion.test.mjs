import assert from "node:assert/strict";
import { access } from "node:fs/promises";
import test from "node:test";
import { buildAntigravityProvider } from "../src/provider.js";
import { createAntigravityEffortStore, recordAntigravityModelEfforts } from "../src/models.js";
import { ANTIGRAVITY_NATIVE_AUTH_MARKER } from "../src/session.js";

const model = { id: "claude-opus-5-5", provider: "antigravity-cli", api: "pi-messages" };
const context = { systemPrompt: "", messages: [{ role: "user", content: "Reply OK", timestamp: 0 }], tools: [] };
const terminal = response => ({ event: "result", result: { status: "SUCCESS", response } });

test("host completion hooks run the native tool-free agent and remove their fresh workspace", async () => {
  let received;
  const provider = buildAntigravityProvider({ command: process.execPath }, {
    executeStream: async function* (request) {
      received = request;
      yield { ...terminal("OK"), result: { ...terminal("OK").result, usage: { input_tokens: 5, output_tokens: 1, total_tokens: 6 } } };
    },
  });
  const signal = new AbortController().signal;
  const stream = provider.createStreamFn()(model, context, { signal, reasoning: "off" });
  let visibleText = "";
  for await (const event of stream) if (event.type === "text_delta") visibleText += event.delta;
  const result = await stream.result();
  assert.equal(result.content[0].text, "OK");
  assert.equal(visibleText, result.content[0].text);
  assert.equal(result.usage.totalTokens, 6);
  assert.equal(received.executionMode, "side-question");
  assert.equal(received.abortSignal, signal);
  assert.equal(received.prompt, "Reply OK");
  assert.equal(received.command, process.execPath);
  assert.ok(received.args.includes("openclaw-antigravity-setup"));
  assert.ok(received.args.includes("claude-opus-5-5"));
  assert.deepEqual(received.args.slice(-4), ["--effort", "low", "--agent", "openclaw-antigravity-setup"]);
  await assert.rejects(access(received.cwd), { code: "ENOENT" });
});

test("completion transport rejects tools, history, and nontext input before execution", async () => {
  let calls = 0;
  const provider = buildAntigravityProvider({}, { executeStream: async function* () { calls++; yield terminal("OK"); } });
  for (const input of [
    { ...context, tools: [{ name: "read" }] },
    { ...context, messages: [...context.messages, ...context.messages] },
    { ...context, messages: [{ role: "user", content: [{ type: "image", data: "fixture" }] }] },
  ]) {
    const result = await provider.createStreamFn()(model, input).result();
    assert.equal(result.stopReason, "error");
  }
  assert.equal(calls, 0);
});

test("native completion checks preserve the host's system instructions", async () => {
  let prompt;
  const provider = buildAntigravityProvider({}, { executeStream: async function* (request) { prompt = request.prompt; yield terminal("OK"); } });
  const result = await provider.createStreamFn()(model, { ...context, systemPrompt: "Reply concisely." }).result();
  assert.equal(result.stopReason, "stop");
  assert.equal(prompt, "System instructions:\nReply concisely.\n\nUser message:\nReply OK");
});

test("profile-qualified probe models retain their model id and effort", async () => {
  let args;
  const provider = buildAntigravityProvider({}, { executeStream: async function* (request) { args = request.args; yield terminal("OK"); } });
  const result = await provider.createStreamFn()({ ...model, id: "gemini-3.8-flash@antigravity-cli:setup-fixture" }, context, { apiKey: ANTIGRAVITY_NATIVE_AUTH_MARKER, reasoning: "off" }).result();
  assert.equal(result.stopReason, "stop");
  assert.equal(args[args.indexOf("--model") + 1], "gemini-3.8-flash");
  assert.equal(args[args.indexOf("--effort") + 1], "low");
  assert.ok(!args.some(arg => arg.includes("@")));
  const id = "gemini-3.8-flash@antigravity-cli:setup-fixture";
  assert.equal(provider.resolveDynamicModel({ modelId: id }).id, id);
});

test("profile-qualified aliases expand only for native execution", async () => {
  let args;
  const provider = buildAntigravityProvider({}, { executeStream: async function* (request) { args = request.args; yield terminal("OK"); } });
  const id = "opus@antigravity-cli:fixture";
  assert.equal(provider.resolveDynamicModel({ modelId: id }).id, id);
  const result = await provider.createStreamFn()({ ...model, id }, context, { reasoning: "off" }).result();
  assert.equal(result.stopReason, "stop");
  assert.equal(args[args.indexOf("--model") + 1], "claude-opus-5-5");
  assert.equal(args[args.indexOf("--effort") + 1], "low");
});

test("native failure and empty terminal replies remain failures", async () => {
  for (const event of [terminal(""), { event: "result", result: { status: "FAILED", error: "Provider quota exhausted" } }]) {
    const provider = buildAntigravityProvider({}, { executeStream: async function* () { yield event; } });
    const result = await provider.createStreamFn()(model, context).result();
    assert.equal(result.stopReason, "error");
    assert.match(result.errorMessage, /no completed visible reply|quota exhausted/);
  }
});

test("a saved API token cannot be validated using the unrelated native AGY login", async () => {
  let calls = 0;
  const provider = buildAntigravityProvider({}, { executeStream: async function* () { calls++; yield terminal("OK"); } });
  const invalid = await provider.createStreamFn()(model, context, { apiKey: "invalid-fixture-token" }).result();
  assert.equal(invalid.stopReason, "error");
  assert.match(invalid.errorMessage, /Reconnect|native login/);
  assert.equal(calls, 0);
  const native = await provider.createStreamFn()(model, context, { apiKey: ANTIGRAVITY_NATIVE_AUTH_MARKER }).result();
  assert.equal(native.stopReason, "stop");
  assert.equal(calls, 1);
});

test("unexpected native tool calls fail the check and clean up", async () => {
  let cwd;
  const provider = buildAntigravityProvider({}, { executeStream: async function* (request) {
    cwd = request.cwd;
    yield { event: "step_update", step_update: { step_type: "tool" } };
  } });
  const result = await provider.createStreamFn()(model, context).result();
  assert.equal(result.stopReason, "error");
  assert.match(result.errorMessage, /attempted a tool call/);
  await assert.rejects(access(cwd), { code: "ENOENT" });
});

test("already cancelled checks do not dispatch and in-flight cancellation cleans up", async () => {
  let calls = 0;
  let cwd;
  const controller = new AbortController();
  const provider = buildAntigravityProvider({}, { executeStream: async function* (request) {
    calls++;
    cwd = request.cwd;
    controller.abort();
    request.abortSignal.throwIfAborted();
  } });
  const inFlight = await provider.createStreamFn()(model, context, { signal: controller.signal }).result();
  assert.equal(inFlight.stopReason, "aborted");
  await assert.rejects(access(cwd), { code: "ENOENT" });
  const beforeDispatch = await provider.createStreamFn()(model, context, { signal: controller.signal }).result();
  assert.equal(beforeDispatch.stopReason, "aborted");
  assert.equal(calls, 1);
});

test("unfamiliar discovered models pass through without inventing an effort flag", async () => {
  const effortStore = createAntigravityEffortStore();
  recordAntigravityModelEfforts(["future-test-model"], effortStore);
  let args;
  const provider = buildAntigravityProvider({}, { effortStore, executeStream: async function* (request) {
    args = request.args;
    yield terminal("OK");
  } });
  const result = await provider.createStreamFn()({ ...model, id: "future-test-model" }, context).result();
  assert.equal(result.stopReason, "stop");
  assert.ok(args.includes("future-test-model"));
  assert.ok(!args.includes("--effort"));
});
