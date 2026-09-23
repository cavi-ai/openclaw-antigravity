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
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { delimiter, isAbsolute, join } from "node:path";
import {
  ANTIGRAVITY_MODEL_ALIASES,
  resolveAntigravityEffort,
  resolveAntigravityTransportModelId,
} from "./models.js";

export const ANTIGRAVITY_BACKEND_ID = "antigravity-cli";
export const TOOL_FREE_SETUP_AGENT_ID = "openclaw-antigravity-setup";
const DEFAULT_COMMAND = "agy";

/**
 * Resolves `agy` for Gateway services whose PATH is only the service bins.
 * Google's installer puts the binary in `~/.local/bin`, which launchd/systemd
 * PATH typically omits even when a login shell can run `agy`.
 *
 * @param {string} [command]
 * @param {NodeJS.ProcessEnv} [env]
 * @param {(path: string) => boolean} [fileExists]
 */
export function resolveAntigravityCommand(
  command = DEFAULT_COMMAND,
  env = process.env,
  fileExists = existsSync,
) {
  const requested = String(command ?? "").trim() || DEFAULT_COMMAND;
  if (isAbsolute(requested) || requested.includes("/") || requested.includes("\\")) {
    return requested;
  }
  const names =
    process.platform === "win32" && !requested.toLowerCase().endsWith(".exe")
      ? [requested, `${requested}.exe`]
      : [requested];
  const home = env.HOME || env.USERPROFILE || homedir();
  const dirs = [];
  const seen = new Set();
  const addDir = (dir) => {
    if (!dir || seen.has(dir)) {
      return;
    }
    seen.add(dir);
    dirs.push(dir);
  };
  for (const dir of String(env.PATH || "").split(delimiter)) {
    addDir(dir);
  }
  addDir(join(home, ".local", "bin"));
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = join(dir, name);
      if (fileExists(candidate)) {
        return candidate;
      }
    }
  }
  return requested;
}

/**
 * Inherit the host env and put the agy installer location on PATH so `execFile`
 * can find `agy` even when the Gateway service PATH does not include it.
 *
 * @param {NodeJS.ProcessEnv} [env]
 */
export function buildAntigravityCommandEnv(env = process.env) {
  const merged = { ...process.env, ...env };
  const home = merged.HOME || merged.USERPROFILE || homedir();
  const extra = join(home, ".local", "bin");
  const parts = [];
  const seen = new Set();
  for (const dir of [extra, ...String(merged.PATH || "").split(delimiter)]) {
    if (!dir || seen.has(dir)) {
      continue;
    }
    seen.add(dir);
    parts.push(dir);
  }
  merged.PATH = parts.join(delimiter);
  return merged;
}

/** agy print mode cannot prompt a human, so tool calls need a non-review mode. */
export const DEFAULT_MODE = "accept-edits";

const EFFORT_ARG = "--effort";
const EFFORT_LEVELS = new Set(["low", "medium", "high"]);

function stripEffortArgs(args) {
  const normalized = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? "";
    if (arg === EFFORT_ARG) {
      const maybeValue = args[index + 1];
      if (
        typeof maybeValue === "string" &&
        maybeValue.trim().length > 0 &&
        !maybeValue.startsWith("-")
      ) {
        index += 1;
      }
      continue;
    }
    if (arg.startsWith(`${EFFORT_ARG}=`)) {
      continue;
    }
    normalized.push(arg);
  }
  return normalized;
}

/**
 * Replaces any `--effort` in args with the given level.
 * Unset and values outside low|medium|high omit the flag.
 *
 * @param {readonly string[]} baseArgs
 * @param {string | null | undefined} thinkingLevel
 */
export function resolveAntigravityEffortArgs(baseArgs, thinkingLevel) {
  const level = typeof thinkingLevel === "string" ? thinkingLevel.trim().toLowerCase() : "";
  const args = stripEffortArgs(baseArgs);
  if (!EFFORT_LEVELS.has(level)) {
    return args;
  }
  return [...args, EFFORT_ARG, level];
}

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
  const command = resolveAntigravityCommand(options.command?.trim() || DEFAULT_COMMAND);
  return {
    id: ANTIGRAVITY_BACKEND_ID,
    runtimeArtifact: {
      kind: "bundled-package-tree",
      packageName: "agy",
      entrypoint: "command",
      nativeExecutableNames: ["agy", "agy.exe"],
    },
    sideQuestionToolMode: "disabled",
    resolveExecutionArgs: ({ baseArgs, executionMode, thinkingLevel, modelId }) => {
      // agy requires `--effort` on models with effort rows, including the
      // setup probe, and rejects it on Claude.
      const args = resolveAntigravityEffortArgs(
        baseArgs,
        resolveAntigravityEffort(modelId, thinkingLevel),
      );
      return executionMode === "side-question"
        ? [...args, "--agent", TOOL_FREE_SETUP_AGENT_ID]
        : args;
    },
    resolveModelId: ({ modelId }) => resolveAntigravityTransportModelId(modelId),
    // Standalone backend: omit modelProvider. Setting it, even to this backend's
    // own id, registers a CLI runtime alias and the model picker hides the provider.
    // Direct `antigravity-cli/<model>` refs stay selectable.
    config: {
      command,
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
