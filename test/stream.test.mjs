import assert from "node:assert/strict";
import test from "node:test";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildAntigravityCliBackend } from "../src/cli-backend.js";

const parse = (record) => buildAntigravityCliBackend().parseJsonlEvent(JSON.stringify(record));
const step = (update) => ({ event: "step_update", step_update: { conversation_id: "conversation-1", step_index: 2, ...update } });

test("streams only incremental response text, retaining unicode and final session usage", () => {
  assert.deepEqual(parse({ event: "init", conversation_id: "conversation-1" }), { kind: "sessionId", sessionId: "conversation-1" });
  assert.deepEqual(parse(step({ step_type: "agent_response", state: "ACTIVE", text_delta: "héllo 🌍" })), [{ kind: "text", text: "héllo 🌍" }]);
  assert.deepEqual(parse(step({ step_type: "agent_response", state: "DONE", usage: { input_tokens: 4 } })), []);
  assert.deepEqual(parse({ event: "result", result: { conversation_id: "conversation-1", status: "SUCCESS", response: "héllo 🌍", usage: { input_tokens: 8, output_tokens: 3, cache_read_tokens: 2, total_tokens: 11 } } }), {
    kind: "result", sessionId: "conversation-1", text: "héllo 🌍", usage: { input: 8, output: 3, cacheRead: 2, total: 11 },
  });
});

test("correlates tool starts and results even when the first observed snapshot is DONE", () => {
  const tool = { step_type: "tool", tool_name: "view_file", tool_info: { name: "view_file", parameters: { AbsolutePath: "/workspace/fixture.txt" } } };
  assert.deepEqual(parse(step({ ...tool, state: "ACTIVE" })), [{ kind: "toolStart", toolCallId: "agy:conversation-1:2", name: "view_file", args: { AbsolutePath: "/workspace/fixture.txt" } }]);
  assert.deepEqual(parse(step({ ...tool, state: "DONE", tool_info: { ...tool.tool_info, output: "2 lines, 20 bytes" } })), [
    { kind: "toolStart", toolCallId: "agy:conversation-1:2", name: "view_file", args: { AbsolutePath: "/workspace/fixture.txt" } },
    { kind: "toolResult", toolCallId: "agy:conversation-1:2", name: "view_file", isError: false, result: "2 lines, 20 bytes" },
  ]);
  assert.notEqual(parse(step({ ...tool, state: "ACTIVE", conversation_id: "conversation-2" }))[0].toolCallId, "agy:conversation-1:2");
});

test("ignores future event types and does not render user/system text as assistant text", () => {
  assert.deepEqual(parse({ event: "future_event", text: "hidden" }), []);
  assert.deepEqual(parse(step({ step_type: "user_input", text_delta: "hidden" })), []);
  assert.deepEqual(parse(step({ step_type: "system_message", text_delta: "hidden" })), []);
  assert.throws(() => buildAntigravityCliBackend().parseJsonlEvent("not-json"), /JSON/);
});

test("rejects malformed terminal records and surfaces unsuccessful results with partial text", () => {
  assert.throws(() => parse({ event: "result", result: {} }), /status/);
  const error = parse({ event: "result", result: { status: "ERROR", response: "partial", error: { message: "quota exhausted" } } });
  assert.equal(error.kind, "result");
  assert.equal(error.text, "partial");
  assert.match(error.errorText, /quota exhausted/);
  assert.throws(() => parse(step({ step_type: "tool", state: "ACTIVE", tool_name: "view_file", step_index: -1 })), /step/);
  const failedTool = parse(step({ step_type: "tool", state: "ERROR", tool_name: "view_file", tool_info: { error: { type: "TOOL_ERROR", message: "permission denied" } } }));
  assert.deepEqual(failedTool.at(-1).result, { type: "TOOL_ERROR", message: "permission denied" });
  assert.equal(failedTool.at(-1).isError, true);
  assert.match(parse({ event: "result", result: { status: "SUCCESS", response: "", denied_actions: [{ action: "read_file", display_name: "ViewFile" }] } }).errorText, /read_file/);
});

async function collect(script, extra = {}) {
  const execute = buildAntigravityCliBackend().prepareExecution().execute;
  const events = [];
  for await (const event of execute({ command: process.execPath, args: ["-e", script], cwd: process.cwd(), env: process.env, prompt: "fixture", ...extra })) events.push(event);
  return events;
}

test("transport waits for a successful terminal result and handles split UTF-8 records", async () => {
  const records = await collect(`const b=Buffer.from(JSON.stringify({event:'result',result:{status:'SUCCESS',response:'🌍'}})+'\\n');process.stdout.write(b.subarray(0,b.length-7));process.stdout.write(b.subarray(b.length-7));`);
  assert.equal(records[0].result.response, "🌍");
  assert.equal(records[0].type, "result");
  assert.equal(records[0].is_error, false);
  assert.equal((await collect(`console.log(JSON.stringify({event:'result',result:{status:'ERROR',response:'partial'}}));`))[0].is_error, true);
  await assert.rejects(collect(`console.log(JSON.stringify({event:'step_update',step_update:{text_delta:'partial'}}));`), /without a terminal result/);
  await assert.rejects(collect(`console.log('not-json');`), /JSON/);
  await assert.rejects(collect(`console.log(JSON.stringify({event:'result',result:{status:'SUCCESS'}}));process.exitCode=3;`), /exited.*3/);
  await assert.rejects(collect(`console.log(JSON.stringify({event:'result',result:{}}));`), /status/);
  await assert.rejects(collect(`console.log('x'.repeat(1048577));`), /line limit/);
  await assert.rejects(collect(`console.log(JSON.stringify({event:'result',result:{status:'SUCCESS'}}));console.log(JSON.stringify({event:'init'}));`), /after its terminal result/);
});

test("transport preserves initial system guidance and per-turn context without replaying system guidance on resume", async () => {
  const script = `console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:process.argv[process.argv.indexOf('--print')+1]}}));`;
  const extra = { args: ["-e", script, "--", "--print", "original", "--output-format", "stream-json"], systemPrompt: "system guidance", prompt: "--user request", promptContext: { prependContext: "before", appendContext: "after" } };
  assert.equal((await collect(script, extra))[0].result.response, "system guidance\n\nbefore\n\n--user request\n\nafter");
  assert.equal((await collect(script, { ...extra, useResume: true }))[0].result.response, "before\n\n--user request\n\nafter");
  assert.equal(
    (await collect(script, { ...extra, executionMode: "side-question" }))[0].result.response,
    "before\n\n--user request\n\nafter",
  );
});

test("transport sends oversized composed prompts through stdin and reports spawn failures", async () => {
  const script = `let text='';process.stdin.setEncoding('utf8');process.stdin.on('data',s=>text+=s);process.stdin.on('end',()=>console.log(JSON.stringify({event:'result',result:{status:'SUCCESS',response:String(text.length)}})));`;
  const events = await collect(script, { args: ["-e", script, "--", "--print", "--output-format", "stream-json"], prompt: "x".repeat(96001) });
  assert.equal(events[0].result.response, "96001");
  await assert.rejects(collect("", { command: "/missing-agy-fixture" }), { code: "ENOENT" });
});

test("resumed usage counts the current response steps once rather than the whole conversation", async () => {
  const update = { event: "step_update", step_update: { conversation_id: "conversation-1", step_index: 7, step_type: "agent_response", state: "DONE", usage: { input_tokens: 12, output_tokens: 3, thinking_tokens: 1, cache_read_tokens: 5, total_tokens: 15 } } };
  const final = { event: "result", result: { conversation_id: "conversation-1", status: "SUCCESS", response: "reply", num_turns: 2, usage: { input_tokens: 112, output_tokens: 23, thinking_tokens: 4, cache_read_tokens: 50, total_tokens: 135 } } };
  const events = await collect(`for(const record of ${JSON.stringify([update, update, final])})console.log(JSON.stringify(record));`);
  assert.deepEqual(events.at(-1).result.usage, { input_tokens: 12, output_tokens: 3, thinking_tokens: 1, cache_read_tokens: 5, total_tokens: 15 });
});

test("resumed tool usage stays on that step and a resumed turn without step usage reports none", async () => {
  const tool = { event: "step_update", step_update: { conversation_id: "conversation-1", step_index: 4, step_type: "tool", state: "DONE", usage: { input_tokens: 9, output_tokens: 1, thinking_tokens: 0, cache_read_tokens: 0, total_tokens: 10 } } };
  const final = { event: "result", result: { status: "SUCCESS", response: "ok", usage: { input_tokens: 500, output_tokens: 80, total_tokens: 580 } } };
  const withTool = await collect(`for (const record of ${JSON.stringify([tool, final])}) console.log(JSON.stringify(record));`, { useResume: true });
  assert.deepEqual(withTool.at(-1).result.usage, tool.step_update.usage);
  const bare = await collect(`console.log(${JSON.stringify(JSON.stringify(final))});`, { useResume: true });
  assert.equal(bare.at(-1).result.usage, undefined);
  const firstTurn = await collect(`console.log(${JSON.stringify(JSON.stringify(final))});`);
  assert.deepEqual(firstTurn.at(-1).result.usage, final.result.usage);
});

test("parser maps thinking tokens onto reasoningTokens", () => {
  assert.deepEqual(
    parse({ event: "result", result: { status: "SUCCESS", response: "ok", usage: { input_tokens: 1, output_tokens: 2, thinking_tokens: 3, cache_read_tokens: 4, total_tokens: 6 } } }).usage,
    { input: 1, output: 2, reasoningTokens: 3, cacheRead: 4, total: 6 },
  );
});

test("transport cleans up the child when its consumer stops or the run is cancelled", async () => {
  const execute = buildAntigravityCliBackend().prepareExecution().execute;
  const controller = new AbortController();
  const iterator = execute({ command: process.execPath, args: ["-e", `console.log(JSON.stringify({event:'init',conversation_id:String(process.pid)}));setInterval(()=>{},10000);`], cwd: process.cwd(), env: process.env, prompt: "fixture", abortSignal: controller.signal });
  const first = await iterator.next();
  const pid = Number(first.value.conversation_id);
  const pending = iterator.next();
  controller.abort();
  await assert.rejects(pending, /abort/i);
  assert.throws(() => process.kill(pid, 0), { code: "ESRCH" });
  const stopped = execute({ command: process.execPath, args: ["-e", `console.log(JSON.stringify({event:'init',conversation_id:String(process.pid)}));setInterval(()=>{},10000);`], cwd: process.cwd(), env: process.env, prompt: "fixture" });
  const stoppedPid = Number((await stopped.next()).value.conversation_id);
  await stopped.return();
  assert.throws(() => process.kill(stoppedPid, 0), { code: "ESRCH" });
});

test("transport terminates native tool descendants holding inherited pipes", async () => {
  if (process.platform === "win32") return;
  const root = await mkdtemp(join(tmpdir(), "agy-process-tree-"));
  const marker = join(root, "terminated");
  const controller = new AbortController();
  const nativeTool = `process.on('SIGTERM',()=>{require('node:fs').writeFileSync(${JSON.stringify(marker)},'terminated');process.exit(0)});console.log(JSON.stringify({event:'init',conversation_id:String(process.pid)}));setTimeout(()=>process.exit(0),2000);`;
  const parent = `require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(nativeTool)}],{stdio:['ignore','inherit','inherit']});setInterval(()=>{},10000);`;
  const iterator = buildAntigravityCliBackend().prepareExecution().execute({ command: process.execPath, args: ["-e", parent], cwd: process.cwd(), env: process.env, prompt: "fixture", abortSignal: controller.signal });
  try {
    await iterator.next();
    const pending = iterator.next();
    controller.abort();
    await assert.rejects(pending, /abort/i);
    assert.equal(await readFile(marker, "utf8"), "terminated");
  } finally {
    controller.abort();
    await iterator.return();
    await rm(root, { recursive: true, force: true });
  }
});

test("cancellation kills a SIGTERM-resistant tool even after its parent closes", async () => {
  if (process.platform === "win32") return;
  const root = await mkdtemp(join(tmpdir(), "agy-resistant-tool-"));
  const marker = join(root, "survived");
  const controller = new AbortController();
  const nativeTool = `process.on('SIGTERM',()=>{});process.send('ready');setTimeout(()=>require('node:fs').writeFileSync(${JSON.stringify(marker)},'survived'),300);setTimeout(()=>process.exit(0),2000);`;
  const parent = `const tool=require('node:child_process').spawn(process.execPath,['-e',${JSON.stringify(nativeTool)}],{stdio:['ignore','ignore','ignore','ipc']});tool.on('message',()=>console.log(JSON.stringify({event:'init',conversation_id:String(tool.pid)})));setInterval(()=>{},10000);`;
  const iterator = buildAntigravityCliBackend().prepareExecution().execute({ command: process.execPath, args: ["-e", parent], cwd: process.cwd(), env: process.env, prompt: "fixture", abortSignal: controller.signal });
  let toolPid;
  try {
    toolPid = Number((await iterator.next()).value.conversation_id);
    const pending = iterator.next();
    controller.abort();
    await assert.rejects(pending, /abort/i);
    await new Promise((resolve) => setTimeout(resolve, 400));
    await assert.rejects(access(marker), { code: "ENOENT" });
  } finally {
    controller.abort();
    await iterator.return();
    if (toolPid) {
      try { process.kill(toolPid, "SIGKILL"); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
    await rm(root, { recursive: true, force: true });
  }
});
