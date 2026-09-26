// Provider registration for Antigravity (`agy`).
//
// agy owns the user's Antigravity OAuth session. Guided discovery/reconnect
// validates that CLI-owned session, writes the listed models, and records a
// non-secret session marker. OpenClaw does not store the Antigravity access
// token, refresh token, or access-token expiry.
import { execFile } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import {
  ANTIGRAVITY_BACKEND_ID,
  buildAntigravityCommandEnv,
  resolveAntigravityCommand,
} from "./cli-backend.js";
import {
  ANTIGRAVITY_BASE_URL,
  ANTIGRAVITY_DEFAULT_MODEL,
  ANTIGRAVITY_MODEL_ALIASES,
  ANTIGRAVITY_MODEL_API,
  antigravityEffortLevels,
  buildAntigravityModelCatalog,
  defaultAntigravityEffort,
  normalizeAntigravityModelIds,
  openClawModelId,
  recordAntigravityModelEfforts,
} from "./models.js";
import { buildAntigravitySessionProfile } from "./session.js";

export const ANTIGRAVITY_PROVIDER_ID = ANTIGRAVITY_BACKEND_ID;
const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 15_000;
const LIVE_MODEL_CACHE_MS = 60_000;
const COMMAND_MAX_BUFFER_BYTES = 1_048_576;
const MINIMUM_TOOL_FREE_AGY_VERSION = [1, 2, 1];
const TOOL_FREE_SETUP_PLUGIN_ROOT = join(
  dirname(fileURLToPath(import.meta.url)),
  "..",
  "agy-plugin",
);

const MISSING_AUTH_MESSAGE =
  "Antigravity CLI is not ready. Install Google's Antigravity CLI (`agy`), sign in with your Google subscription, then confirm with `agy models`. This provider stores no API key in OpenClaw.";
const RECONNECT_ERROR_MESSAGE =
  "Antigravity CLI could not list models. Run `agy` in a terminal to sign in, then choose Reconnect again. OpenClaw stores no Antigravity credential.";

function describeCommandFailure(error) {
  if (!error || typeof error !== "object") {
    return String(error ?? "unknown error");
  }
  if (error.code === "ENOENT") {
    return "agy was not found. Install Google's Antigravity CLI, or set plugins.entries.antigravity.config.command to its absolute path.";
  }
  if (error.code === "ETIMEDOUT" || error.killed === true) {
    return "agy timed out.";
  }
  const output = [error.stderr, error.stdout, error.message]
    .filter(Boolean)
    .join("\n")
    .trim();
  const first = output.split(/\r?\n/).find((line) => line.trim());
  return first ? first.trim().slice(0, 300) : "agy failed.";
}

function reconnectFailure(error) {
  return new Error(`${RECONNECT_ERROR_MESSAGE} (${describeCommandFailure(error)})`);
}

async function runCommand(command, args, context = {}) {
  const env = buildAntigravityCommandEnv(context.env);
  const result = await execFileAsync(resolveAntigravityCommand(command, env), args, {
    env,
    signal: context.signal,
    timeout: context.timeoutMs ?? COMMAND_TIMEOUT_MS,
    maxBuffer: COMMAND_MAX_BUFFER_BYTES,
  });
  return [result.stdout, result.stderr].filter(Boolean).join("\n");
}

function throwIfAborted(signal) {
  signal?.throwIfAborted?.();
}

function isAbortError(error, signal) {
  return signal?.aborted === true || error?.name === "AbortError" || error?.code === "ABORT_ERR";
}

function supportsToolFreeSetupAgent(output) {
  const match = /(\d+)\.(\d+)\.(\d+)/u.exec(String(output ?? ""));
  if (!match) {
    return false;
  }
  const version = match.slice(1).map(Number);
  for (let index = 0; index < version.length; index += 1) {
    if (version[index] !== MINIMUM_TOOL_FREE_AGY_VERSION[index]) {
      return version[index] > MINIMUM_TOOL_FREE_AGY_VERSION[index];
    }
  }
  return true;
}

/** Extracts model ids from the human-readable `agy models` table. */
export function parseAntigravityModelIds(output) {
  const ids = [];
  for (const line of String(output ?? "").split(/\r?\n/)) {
    const match = /^\s*([a-z0-9][a-z0-9._-]*-[a-z0-9][a-z0-9._-]*)\s+\S.*$/u.exec(line);
    const id = match?.[1];
    if (!id || ids.includes(id)) {
      continue;
    }
    ids.push(id);
  }
  return ids;
}

function chooseDetectedModel(modelIds) {
  return modelIds.includes(ANTIGRAVITY_DEFAULT_MODEL)
    ? ANTIGRAVITY_DEFAULT_MODEL
    : modelIds[0];
}

export const ANTIGRAVITY_THINKING_PROFILE = {
  levels: [{ id: "off" }, { id: "low" }, { id: "medium" }, { id: "high" }],
};

/**
 * Thinking levels OpenClaw offers for a model: the `agy --effort` levels it
 * lists, with no `off`. Claude and unknown models keep the generic profile.
 */
export function antigravityThinkingProfile(modelId) {
  const levels = antigravityEffortLevels(modelId);
  if (!levels?.length) {
    return ANTIGRAVITY_THINKING_PROFILE;
  }
  return {
    levels: levels.map((id) => ({ id })),
    defaultLevel: defaultAntigravityEffort(levels),
  };
}

/**
 * @param {{command?: string}} [options]
 * @param {{runCommand?: typeof runCommand}} [dependencies]
 */
export function buildAntigravityProvider(options = {}, dependencies = {}) {
  const command = options.command?.trim() || "agy";
  const execute = dependencies.runCommand ?? runCommand;
  let liveModelCache = { at: 0, ids: [] };

  const listModels = async (context = {}) => {
    throwIfAborted(context.signal);
    const now = Date.now();
    if (!context.refresh && liveModelCache.ids.length > 0 && now - liveModelCache.at < LIVE_MODEL_CACHE_MS) {
      return liveModelCache.ids;
    }
    const output = await execute(command, ["models"], context);
    throwIfAborted(context.signal);
    const agyIds = parseAntigravityModelIds(output);
    recordAntigravityModelEfforts(agyIds);
    const ids = normalizeAntigravityModelIds(agyIds);
    liveModelCache = { at: now, ids };
    return ids;
  };

  const installToolFreeSetupAgent = async (context) => {
    throwIfAborted(context.signal);
    const version = await execute(command, ["--version"], context);
    if (!supportsToolFreeSetupAgent(version)) {
      throw new Error("Antigravity CLI 1.2.1 or newer is required for tool-free setup checks.");
    }
    await execute(command, ["plugin", "install", TOOL_FREE_SETUP_PLUGIN_ROOT], context);
    throwIfAborted(context.signal);
  };

  const detect = async (context) => {
    try {
      const modelId = chooseDetectedModel(await listModels(context));
      return modelId
        ? {
            modelRef: `${ANTIGRAVITY_PROVIDER_ID}/${modelId}`,
            detail: `${modelId} via agy`,
          }
        : null;
    } catch (error) {
      if (isAbortError(error, context.signal)) {
        throw error;
      }
      return null;
    }
  };

  const googleModelsFrom = (config) => {
    const models = config?.models?.providers?.google?.models;
    return Array.isArray(models) ? models : [];
  };

  const catalogOptionsFor = (config) => ({ googleModels: googleModelsFrom(config) });

  // On a successful reconnect, persist the non-secret endpoint and the model
  // rows from the `agy models` listing just fetched. A non-array `models`
  // value, such as `$include`, is left in place. The session profile is only
  // the marker; agy owns login refresh. Discovered refs are merged into
  // `agents.defaults.models` the same way other provider setup patches do:
  // existing entries and aliases stay, and this provider's models are added.
  const buildConnectionPatch = (config = {}, modelIds = []) => {
    const existing = config.models?.providers?.[ANTIGRAVITY_PROVIDER_ID] ?? {};
    const { models: existingModels, ...rest } = existing;
    const keepModels =
      existingModels && typeof existingModels === "object" && !Array.isArray(existingModels)
        ? existingModels
        : undefined;
    const catalog = buildAntigravityModelCatalog(modelIds, catalogOptionsFor(config));
    const modelEntries = { ...(config.agents?.defaults?.models ?? {}) };
    for (const model of catalog) {
      const ref = `${ANTIGRAVITY_PROVIDER_ID}/${model.id}`;
      modelEntries[ref] = { ...(modelEntries[ref] ?? {}) };
    }
    return {
      models: {
        mode: config.models?.mode ?? "merge",
        providers: {
          [ANTIGRAVITY_PROVIDER_ID]: {
            ...rest,
            baseUrl: ANTIGRAVITY_BASE_URL,
            api: ANTIGRAVITY_MODEL_API,
            models: keepModels ?? catalog,
          },
        },
      },
      agents: {
        defaults: {
          models: modelEntries,
        },
      },
    };
  };

  const validatedResult = (modelRef, config, modelIds) => {
    return {
      profiles: [buildAntigravitySessionProfile()],
      defaultModel: modelRef,
      configPatch: buildConnectionPatch(config, modelIds),
    };
  };

  return {
    id: ANTIGRAVITY_PROVIDER_ID,
    label: "Antigravity CLI",
    aliases: ["antigravity", "agy"],
    envVars: [],
    auth: [
      {
        id: "cli",
        label: "Antigravity CLI",
        hint: "Reconnect the CLI-owned Antigravity session and refresh available models",
        kind: "custom",
        appGuidedSetup: {
          detectAvailability: async (context) => {
            try {
              throwIfAborted(context.signal);
              const version = await execute(command, ["--version"], context);
              throwIfAborted(context.signal);
              return supportsToolFreeSetupAgent(version);
            } catch (error) {
              if (isAbortError(error, context.signal)) {
                throw error;
              }
              return false;
            }
          },
          detect,
          prepare: async (context) => {
            const prefix = `${ANTIGRAVITY_PROVIDER_ID}/`;
            if (!context.modelRef.startsWith(prefix)) {
              return null;
            }
            const modelId = openClawModelId(
              context.modelRef.slice(prefix.length).replace(/-thinking$/u, ""),
            );
            try {
              await installToolFreeSetupAgent(context);
              const available = await listModels({ ...context, refresh: true });
              return available.includes(modelId)
                ? validatedResult(`${prefix}${modelId}`, context.config, available)
                : null;
            } catch (error) {
              if (isAbortError(error, context.signal)) {
                throw error;
              }
              return null;
            }
          },
        },
        run: async (context) => {
          try {
            await installToolFreeSetupAgent(context);
          } catch (error) {
            if (isAbortError(error, context.signal)) {
              throw error;
            }
            throw reconnectFailure(error);
          }
          let modelIds;
          try {
            modelIds = await listModels({ ...context, refresh: true });
          } catch (error) {
            if (isAbortError(error, context.signal)) {
              throw error;
            }
            throw reconnectFailure(error);
          }
          const modelId = chooseDetectedModel(modelIds);
          if (!modelId) {
            throw reconnectFailure(new Error("agy listed no models."));
          }
          return validatedResult(
            `${ANTIGRAVITY_PROVIDER_ID}/${modelId}`,
            context.config,
            modelIds,
          );
        },
      },
    ],
    buildMissingAuthMessage: () => MISSING_AUTH_MESSAGE,
    buildAuthDoctorHint: () => MISSING_AUTH_MESSAGE,
    catalog: {
      order: "simple",
      run: async (context = {}) => {
        try {
          const modelIds = await listModels(context);
          if (modelIds.length > 0) {
            return {
              provider: {
                baseUrl: ANTIGRAVITY_BASE_URL,
                api: ANTIGRAVITY_MODEL_API,
                defaultModel: chooseDetectedModel(modelIds),
                models: buildAntigravityModelCatalog(modelIds, catalogOptionsFor(context.config)),
              },
            };
          }
        } catch (error) {
          if (isAbortError(error, context.signal)) {
            throw error;
          }
        }
        return {
          provider: {
            baseUrl: ANTIGRAVITY_BASE_URL,
            api: ANTIGRAVITY_MODEL_API,
            defaultModel: ANTIGRAVITY_DEFAULT_MODEL,
            models: buildAntigravityModelCatalog(undefined, catalogOptionsFor(context.config)),
          },
        };
      },
    },
    staticCatalog: {
      order: "simple",
      run: async () => ({
        provider: {
          // `agy` is the transport, so nothing here is ever dialed. Both fields
          // are still required shape: a provider row without `baseUrl` fails
          // catalog assembly, which takes down prepared-runtime publication for
          // every agent, not just this provider.
          baseUrl: ANTIGRAVITY_BASE_URL,
          api: ANTIGRAVITY_MODEL_API,
          defaultModel: ANTIGRAVITY_DEFAULT_MODEL,
          models: buildAntigravityModelCatalog(),
        },
      }),
    },
    wizard: {
      setup: {
        methodId: "cli",
        modelSelection: {
          promptWhenAuthChoiceProvided: true,
        },
      },
    },
    resolveThinkingProfile: (ctx) => antigravityThinkingProfile(ctx?.modelId),
    // agy accepts model ids this catalog has not caught up with. Rather than
    // fail the run, pass an unknown id straight through to `--model`.
    resolveDynamicModel: (ctx) => {
      const modelId = typeof ctx?.modelId === "string" ? ctx.modelId.trim() : "";
      if (!modelId) {
        return null;
      }
      const aliased = ANTIGRAVITY_MODEL_ALIASES[modelId] ?? modelId;
      const resolved = openClawModelId(aliased.replace(/-thinking$/u, ""));
      return {
        id: resolved,
        provider: ANTIGRAVITY_PROVIDER_ID,
        name: resolved,
        api: ANTIGRAVITY_MODEL_API,
        baseUrl: ANTIGRAVITY_BASE_URL,
        reasoning: true,
        input: ["text"],
      };
    },
  };
}
