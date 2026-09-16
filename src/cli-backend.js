// CLI backend that drives Google's Antigravity CLI (`agy`) in print mode.
//
// This is the `claude -p` pattern: OpenClaw owns the conversation, agy owns
// inference and auth. agy authenticates itself against the user's Antigravity
// subscription, so this backend carries no API key and no auth methods.
//
// `agy --print --output-format json` emits a single flat object:
//   {"conversation_id":"…","status":"SUCCESS","response":"…","duration_seconds":…,
//    "num_turns":1,"usage":{input_tokens,output_tokens,…}}
// Core's generic JSON reader already takes `response` as the assistant text and
// `sessionIdFields` for the resume handle, so no stream dialect is needed. agy's
// `--output-format stream-json` is its own dialect (event/step_update/result) and
// matches neither claude-stream-json nor gemini-stream-json; adopting it would
// require a core dialect, so print+json is used instead.
import { ANTIGRAVITY_MODEL_ALIASES } from "./models.js";

export const ANTIGRAVITY_BACKEND_ID = "antigravity-cli";
export const TOOL_FREE_SETUP_AGENT_ID = "openclaw-antigravity-setup";

/** agy print mode cannot prompt a human, so tool calls need a non-review mode. */
export const DEFAULT_MODE = "accept-edits";

/**
 * Builds the args every invocation shares.
 *
 * @param {{mode?: string, skipPermissions?: boolean}} [options]
 */
export function buildBaseArgs(options = {}) {
  const args = ["--print", "{prompt}", "--output-format", "json"];
  const mode = options.mode ?? DEFAULT_MODE;
  if (mode !== "none") {
    args.push("--mode", mode);
  }
  if (options.skipPermissions === true) {
    args.push("--dangerously-skip-permissions");
  }
  return args;
}

/**
 * @param {{command?: string, mode?: string, skipPermissions?: boolean}} [options]
 *   Plugin config from `plugins.entries.antigravity.config`.
 */
export function buildAntigravityCliBackend(options = {}) {
  const base = buildBaseArgs(options);
  return {
    id: ANTIGRAVITY_BACKEND_ID,
    runtimeArtifact: {
      kind: "bundled-package-tree",
      packageName: "agy",
      entrypoint: "command",
      nativeExecutableNames: ["agy", "agy.exe"],
    },
    sideQuestionToolMode: "disabled",
    resolveExecutionArgs: ({ baseArgs, executionMode }) =>
      executionMode === "side-question"
        ? [...baseArgs, "--agent", TOOL_FREE_SETUP_AGENT_ID]
        : baseArgs,
    // Standalone backend: agy's catalog (Gemini + Claude + GPT-OSS behind one
    // subscription) belongs to no existing provider, so it owns direct
    // `antigravity-cli/<model>` refs rather than aliasing a canonical provider.
    modelProvider: ANTIGRAVITY_BACKEND_ID,
    config: {
      command: options.command?.trim() || "agy",
      args: [...base],
      // agy resumes by conversation id; there is no separate session concept.
      resumeArgs: [...base, "--conversation", "{sessionId}"],
      output: "json",
      resumeOutput: "json",
      input: "arg",
      // agy takes the prompt as an argv value. Very long prompts blow the argv
      // limit, so hand those to stdin instead.
      maxPromptArgChars: 96_000,
      modelArg: "--model",
      modelAliases: { ...ANTIGRAVITY_MODEL_ALIASES },
      sessionMode: "existing",
      sessionIdFields: ["conversation_id"],
      // One agy process at a time: concurrent print-mode runs against the same
      // conversation interleave writes to its history.
      serialize: true,
    },
  };
}
