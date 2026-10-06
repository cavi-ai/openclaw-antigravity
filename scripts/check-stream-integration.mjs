#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { runHostIntegrationCheck } from "./check-host-integration.mjs";

/** Exercise native AGY -> plugin -> Gateway text/tool events on disposable host state. */
export async function verifyStreamingRuntime({ gatewayUrl, gatewayToken, tempRoot }) {
  const workspace = join(tempRoot, "stream-workspace");
  await mkdir(workspace, { recursive: true });
  const marker = `stream-fixture-${randomUUID()}`;
  const fixture = join(workspace, "fixture.txt");
  await writeFile(fixture, `${marker}\n`);
  const socket = new WebSocket(gatewayUrl);
  const pending = new Map();
  const events = [];
  let sequence = 0;
  let receiveTurn;
  const request = (method, params) => new Promise((resolve, reject) => {
    const id = String(++sequence);
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`${method} timed out`)); }, 90_000);
    pending.set(id, { resolve, reject, timer });
    socket.send(JSON.stringify({ type: "req", id, method, params }));
  });
  let resolveHello;
  let rejectHello;
  const hello = new Promise((resolve, reject) => { resolveHello = resolve; rejectHello = reject; });
  const helloTimer = setTimeout(() => rejectHello(new Error("Gateway handshake timed out")), 15_000);
  socket.addEventListener("message", ({ data }) => {
    const frame = JSON.parse(String(data));
    if (frame.type === "event" && frame.event === "connect.challenge") {
      request("connect", {
        minProtocol: 4, maxProtocol: 4,
        client: { id: "cli", version: "stream-check", platform: process.platform, mode: "cli" },
        role: "operator", scopes: ["operator.admin"], caps: ["tool-events"],
        auth: { token: gatewayToken },
      }).then(resolveHello, rejectHello);
    } else if (frame.type === "res") {
      const call = pending.get(frame.id);
      if (call) {
        clearTimeout(call.timer);
        pending.delete(frame.id);
        if (frame.ok) call.resolve(frame.payload);
        else call.reject(new Error(frame.error?.message ?? "Gateway request failed"));
      }
    } else if (frame.type === "event") {
      events.push(frame);
      receiveTurn?.(frame);
    }
  });
  socket.addEventListener("error", () => rejectHello(new Error("Gateway socket failed")));
  const sessionKey = `agent:main:stream-check-${randomUUID()}`;
  const sendTurn = async (message) => {
    const offset = events.length;
    let timer;
    let resolveTurn;
    let rejectTurn;
    const settled = new Promise((resolve, reject) => { resolveTurn = resolve; rejectTurn = reject; });
    receiveTurn = (frame) => {
      if (frame.event !== "chat" || frame.payload?.sessionKey !== sessionKey) return;
      if (frame.payload.state === "error") rejectTurn(new Error(frame.payload.errorMessage ?? "AGY turn failed"));
      if (frame.payload.state === "final") resolveTurn(frame.payload);
    };
    timer = setTimeout(() => rejectTurn(new Error("Streaming turn timed out")), 90_000);
    try {
      const [, final] = await Promise.all([
        request("chat.send", { sessionKey, message, thinking: "low", deliver: false, idempotencyKey: randomUUID() }),
        settled,
      ]);
      return { final, events: events.slice(offset) };
    } finally {
      clearTimeout(timer);
      receiveTurn = undefined;
    }
  };
  try {
    await hello;
    clearTimeout(helloTimer);
    await request("sessions.patch", { key: sessionKey, model: "antigravity-cli/gemini-3.1-pro", thinkingLevel: "low", verboseLevel: "full" });
    const first = await sendTurn(`Read ${fixture} using your built-in file reader. Reply with the file contents. Do not run commands, write files, or use other tools.`);
    const agentEvents = first.events.filter((frame) => frame.event === "agent").map((frame) => frame.payload);
    const deltas = agentEvents.filter((event) => event.stream === "assistant" && event.data?.delta);
    const starts = agentEvents.filter((event) => event.stream === "tool" && event.data?.phase === "start");
    const results = agentEvents.filter((event) => event.stream === "tool" && event.data?.phase === "result");
    assert.ok(deltas.length > 0, "Gateway did not publish incremental assistant text");
    assert.ok(starts.some((event) => event.data.name === "view_file"), "Gateway did not publish the native file-reader tool start");
    const start = starts.find((event) => event.data.name === "view_file");
    assert.ok(results.some((event) => event.data.toolCallId === start.data.toolCallId), "Gateway did not publish the correlated tool result");
    assert.ok(JSON.stringify(first.final).includes(marker), "Final response lost the file contents");
    const resumed = await sendTurn("Repeat the exact file contents from the preceding turn. Do not use tools.");
    assert.ok(JSON.stringify(resumed.final).includes(marker), "Follow-up turn lost the native conversation context");
    return { assistantDeltas: deltas.length, toolStarts: starts.length, toolResults: results.length, resumed: true };
  } finally {
    clearTimeout(helloTimer);
    for (const call of pending.values()) {
      clearTimeout(call.timer);
      call.reject(new Error("Streaming check closed"));
    }
    socket.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  runHostIntegrationCheck({ verifyRuntime: verifyStreamingRuntime, checkReconnect: false })
    .then((result) => process.stdout.write(`${JSON.stringify(result, null, 2)}\n`))
    .catch((error) => { process.stderr.write(`${error.message}\n`); process.exitCode = 1; });
}
