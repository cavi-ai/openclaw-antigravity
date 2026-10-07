import { spawn } from "node:child_process";
import { join } from "node:path";

const MAX_LINE_CHARS = 1_048_576;
const STDERR_TAIL_CHARS = 16_384;

function record(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function decode(line) {
  const value = JSON.parse(line);
  if (!record(value) || typeof value.event !== "string") {
    throw new Error("Invalid AGY stream event envelope.");
  }
  return value;
}

const USAGE_FIELDS = [
  ["input_tokens", "input"],
  ["output_tokens", "output"],
  ["thinking_tokens", "reasoningTokens"],
  ["cache_read_tokens", "cacheRead"],
  ["total_tokens", "total"],
];

function usageFrom(value) {
  if (!record(value)) return undefined;
  const usage = {};
  for (const [source, target] of USAGE_FIELDS) {
    if (Number.isFinite(value[source]) && value[source] >= 0) usage[target] = value[source];
  }
  return Object.keys(usage).length ? usage : undefined;
}

function summedStepUsage(steps) {
  const usage = {};
  for (const stepUsage of steps) {
    for (const [source] of USAGE_FIELDS) {
      if (Number.isFinite(stepUsage[source]) && stepUsage[source] >= 0) {
        usage[source] = (usage[source] ?? 0) + stepUsage[source];
      }
    }
  }
  return Object.keys(usage).length ? usage : undefined;
}

function terminalResult(value) {
  if (!record(value) || typeof value.status !== "string" || !value.status.trim()) {
    throw new Error("AGY terminal result is missing its status.");
  }
  const result = {
    kind: "result",
    ...(typeof value.conversation_id === "string" && value.conversation_id
      ? { sessionId: value.conversation_id } : {}),
    ...(typeof value.response === "string" ? { text: value.response } : {}),
  };
  const usage = usageFrom(value.usage);
  if (usage) result.usage = usage;
  if (value.status !== "SUCCESS") {
    const detail = typeof value.error === "string" ? value.error
      : record(value.error) && typeof value.error.message === "string" ? value.error.message : "";
    result.errorText = `AGY turn ended with status ${value.status}${detail ? `: ${detail}` : "."}`;
  } else if (!result.text?.trim() && Array.isArray(value.denied_actions) && value.denied_actions.length) {
    const actions = value.denied_actions.filter(record)
      .map((action) => action.action).filter((action) => typeof action === "string");
    result.errorText = `AGY returned no reply after permission was denied${actions.length ? ` for ${actions.join(", ")}` : ""}.`;
  }
  return result;
}

/** Stateless projection; OpenClaw deduplicates tool snapshots by their native step identity. */
export function parseAntigravityJsonlEvent(line) {
  const value = decode(line);
  if (value.event === "init") {
    return typeof value.conversation_id === "string" && value.conversation_id
      ? { kind: "sessionId", sessionId: value.conversation_id } : [];
  }
  if (value.event === "result") return terminalResult(value.result);
  if (value.event !== "step_update") return [];
  const step = value.step_update;
  if (!record(step)) throw new Error("Invalid AGY step update.");
  if (step.step_type === "agent_response") {
    return typeof step.text_delta === "string" && step.text_delta
      ? [{ kind: "text", text: step.text_delta }] : [];
  }
  if (step.step_type !== "tool") return [];
  if (!Number.isSafeInteger(step.step_index) || step.step_index < 0 ||
      typeof step.conversation_id !== "string" || !step.conversation_id) {
    throw new Error("AGY tool step is missing its native identity.");
  }
  const info = record(step.tool_info) ? step.tool_info : {};
  const name = typeof step.tool_name === "string" && step.tool_name ? step.tool_name : info.name;
  if (typeof name !== "string" || !name) throw new Error("AGY tool step is missing its name.");
  const toolCallId = `agy:${step.conversation_id}:${step.step_index}`;
  const events = [{ kind: "toolStart", toolCallId, name,
    args: record(info.parameters) ? info.parameters : {} }];
  if (["DONE", "ERROR", "FAILED", "INTERRUPTED"].includes(step.state)) {
    events.push({ kind: "toolResult", toolCallId, name,
      isError: step.state !== "DONE", result: info.output ?? info.error });
  }
  return events;
}

/** Run the native CLI without accepting an EOF or a zero exit as a completed turn. */
export async function* executeAntigravityStream(context) {
  context.abortSignal?.throwIfAborted();
  context.assertCurrent?.();
  const args = [...context.args];
  const printIndex = args.indexOf("--print");
  const prompt = [
    context.executionMode !== "side-question" && !context.useResume && context.systemPrompt,
    context.promptContext?.prependContext,
    context.prompt,
    context.promptContext?.appendContext,
  ].filter((value) => typeof value === "string" && value.length > 0).join("\n\n");
  let usesStdin = false;
  if (printIndex >= 0) {
    const hasArgPrompt = args[printIndex + 1] !== "--output-format" && args[printIndex + 1] !== undefined;
    usesStdin = prompt.length > 96_000;
    args.splice(printIndex + 1, hasArgPrompt ? 1 : 0, ...(usesStdin ? [] : [prompt]));
  }
  const child = spawn(context.command, args, {
    cwd: context.cwd, env: context.env, argv0: context.argv0,
    stdio: ["pipe", "pipe", "pipe"], windowsHide: true,
    detached: process.platform !== "win32",
  });
  let closed = false;
  let killTimer;
  let stderr = "";
  const completion = new Promise((resolve) => {
    let error;
    child.once("error", (value) => { error = value; });
    child.once("close", (code, signal) => {
      // A tool can ignore SIGTERM and outlive its parent without holding pipes.
      // Finish cancellation for the whole group before resolving cleanup.
      if (killTimer && process.platform !== "win32") killTree("SIGKILL");
      closed = true;
      clearTimeout(killTimer);
      resolve({ code, signal, error });
    });
  });
  const killTree = (signal) => {
    if (!child.pid) return;
    if (process.platform === "win32") {
      // Windows has no POSIX process groups; use the OS process-tree terminator.
      const taskkill = join(process.env.SystemRoot ?? "C:\\Windows", "System32", "taskkill.exe");
      const killer = spawn(taskkill, ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore", windowsHide: true,
      });
      killer.once("error", () => child.kill(signal));
      killer.once("exit", (code) => { if (code !== 0) child.kill(signal); });
    } else {
      try { process.kill(-child.pid, signal); }
      catch (error) { if (error.code !== "ESRCH") throw error; }
    }
  };
  const terminate = () => {
    if (closed || killTimer) return;
    killTree("SIGTERM");
    killTimer = setTimeout(() => { if (!closed) killTree("SIGKILL"); }, 1_000);
    killTimer.unref();
  };
  context.abortSignal?.addEventListener("abort", terminate, { once: true });
  child.stderr.setEncoding("utf8");
  child.stderr.on("data", (chunk) => { stderr = (stderr + chunk).slice(-STDERR_TAIL_CHARS); });
  child.stdin.on("error", () => {}); // A startup failure can close stdin before the prompt is written.
  child.stdin.end(usesStdin ? prompt : undefined);
  child.stdout.setEncoding("utf8");
  let pending = "";
  let terminal = false;
  const responseUsage = new Map();
  const parseLine = (line) => {
    if (line.length > MAX_LINE_CHARS) throw new Error("AGY stream record exceeds the line limit.");
    if (terminal) throw new Error("AGY emitted another record after its terminal result.");
    const value = decode(line);
    const step = value.step_update;
    if (value.event === "step_update" && record(step) &&
        (step.step_type === "agent_response" || step.step_type === "tool") &&
        step.state === "DONE" && Number.isSafeInteger(step.step_index) && record(step.usage)) {
      responseUsage.set(step.step_index, step.usage);
    }
    if (value.event === "result") {
      const outcome = terminalResult(value.result);
      terminal = true;
      // AGY reports cumulative conversation usage on resume; the host accounts per run.
      // Step usage is this turn. A resumed turn with none omits the cumulative total.
      const summed = summedStepUsage(responseUsage.values());
      if (summed) value.result = { ...value.result, usage: summed };
      else if (context.useResume && record(value.result)) {
        const { usage: _usage, ...rest } = value.result;
        value.result = rest;
      }
      // The plugin-execute contract uses these fields to recognize terminal outcomes.
      return { ...value, type: "result", is_error: Boolean(outcome.errorText) };
    }
    return value;
  };
  try {
    for await (const chunk of child.stdout) {
      context.abortSignal?.throwIfAborted();
      context.assertCurrent?.();
      pending += chunk;
      let newline;
      while ((newline = pending.indexOf("\n")) >= 0) {
        const line = pending.slice(0, newline).trim();
        pending = pending.slice(newline + 1);
        if (line) yield parseLine(line);
      }
      if (pending.length > MAX_LINE_CHARS) throw new Error("AGY stream record exceeds the line limit.");
    }
    if (pending.trim()) yield parseLine(pending.trim());
    const result = await completion;
    context.abortSignal?.throwIfAborted();
    context.assertCurrent?.();
    if (result.error) throw result.error;
    if (result.code !== 0) {
      throw new Error(`AGY exited with code ${result.code ?? result.signal}${stderr.trim() ? `: ${stderr.trim()}` : "."}`);
    }
    if (!terminal) throw new Error("AGY stream ended without a terminal result.");
  } finally {
    context.abortSignal?.removeEventListener("abort", terminate);
    terminate();
    await completion;
  }
}
