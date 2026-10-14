import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createAssistantMessageEventStream } from "openclaw/plugin-sdk/llm";
import { buildAntigravityCliBackend, buildAntigravityCommandEnv } from "./cli-backend.js";
import { executeAntigravityStream, parseAntigravityJsonlEvent } from "./stream.js";
import { isAntigravityAuthMarker } from "./session.js";

/** Host-owned one-shot completions use the same native AGY executor as the CLI backend. */
export function createAntigravityCompletionStream(options = {}, effortStore, execute = executeAntigravityStream) {
  const backend = buildAntigravityCliBackend(options, effortStore);
  return (model, context, streamOptions = {}) => {
    const stream = createAssistantMessageEventStream();
    const message = {
      role: "assistant", api: model.api, provider: model.provider, model: model.id,
      content: [], usage: {
        input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0,
        cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
      }, stopReason: "stop", timestamp: Date.now(),
    };
    stream.push({ type: "start", partial: message });
    void (async () => {
      try {
        streamOptions.signal?.throwIfAborted();
        if (streamOptions.apiKey !== undefined && !isAntigravityAuthMarker(streamOptions.apiKey)) {
          throw new Error("Antigravity uses its native login and cannot validate a supplied API token. Use Reconnect to check the CLI session.");
        }
        if (context.tools?.length || context.messages?.length !== 1 || context.messages[0].role !== "user") {
          throw new Error("Antigravity completion checks require one user message and no tools.");
        }
        const content = context.messages[0].content;
        if (typeof content !== "string" && (!Array.isArray(content) || content.some(part => part.type !== "text" || typeof part.text !== "string"))) {
          throw new Error("Antigravity completion checks support text only.");
        }
        const text = typeof content === "string" ? content : content.map(part => part.text).join("\n");
        const prompt = context.systemPrompt ? `System instructions:\n${context.systemPrompt}\n\nUser message:\n${text}` : text;
        const cwd = await mkdtemp(join(tmpdir(), "antigravity-completion-"));
        let result;
        try {
          const args = backend.resolveExecutionArgs({
            baseArgs: [...backend.config.args, "--model", backend.resolveModelId({ modelId: model.id })],
            executionMode: "side-question", modelId: model.id, thinkingLevel: streamOptions.reasoning,
          });
          for await (const event of execute({
            command: backend.config.command, args, cwd, prompt, executionMode: "side-question",
            env: buildAntigravityCommandEnv(), abortSignal: streamOptions.signal,
          })) {
            if (event.step_update?.step_type === "tool") throw new Error("Antigravity completion check unexpectedly attempted a tool call.");
            if (event.event === "result") result = parseAntigravityJsonlEvent(JSON.stringify(event));
          }
        } finally {
          await rm(cwd, { recursive: true, force: true });
        }
        streamOptions.signal?.throwIfAborted();
        if (!result || result.errorText || !result.text?.trim()) throw new Error(result?.errorText || "Antigravity returned no completed visible reply.");
        message.content = [{ type: "text", text: result.text }];
        stream.push({ type: "text_start", contentIndex: 0, partial: message });
        stream.push({ type: "text_delta", contentIndex: 0, delta: result.text, partial: message });
        stream.push({ type: "text_end", contentIndex: 0, content: result.text, partial: message });
        for (const key of ["input", "output", "cacheRead", "cacheWrite"]) {
          if (result.usage?.[key] !== undefined) message.usage[key] = result.usage[key];
        }
        message.usage.totalTokens = result.usage?.total ?? message.usage.input + message.usage.output + message.usage.cacheRead + message.usage.cacheWrite;
        stream.push({ type: "done", reason: "stop", message });
        stream.end(message);
      } catch (error) {
        message.stopReason = streamOptions.signal?.aborted ? "aborted" : "error";
        message.errorMessage = error instanceof Error ? error.message : String(error);
        stream.push({ type: "error", reason: message.stopReason, error: message });
        stream.end(message);
      }
    })();
    return stream;
  };
}
