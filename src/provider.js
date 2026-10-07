// Provider registration for Antigravity (`agy`).
//
// agy owns the user's Antigravity OAuth session. Guided discovery/reconnect
// asks agy whether that session is usable, the same way Claude CLI and Codex
// report their own logins. OpenClaw does not store an Antigravity auth profile,
// access token, refresh token, access-token expiry, or a provider API key.
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
  antigravityModelReasons,
  buildAntigravityModelCatalog,
  defaultAntigravityEffort,
  normalizeAntigravityModelIds,
  openClawModelId,
  recordAntigravityModelEfforts,
} from "./models.js";
import {
  antigravityNativeAuthResult,
  isAntigravityAuthMarker,
  shouldDeferAntigravitySyntheticProfileAuth,
} from "./session.js";

export const ANTIGRAVITY_PROVIDER_ID = ANTIGRAVITY_BACKEND_ID;

const ANTIGRAVITY_OPENCLAW_CONTEXT = [
  "You are running through OpenClaw's Antigravity CLI model provider.",
  "Use the installed `openclaw` CLI for OpenClaw operations and check its help before assuming command syntax.",
  "Use `mcporter` for external MCP servers that OpenClaw manages and check its help before assuming command syntax.",
  "Do not change global OpenClaw or mcporter configuration unless the user explicitly asks.",
  "Inline images are not supported.",
  "Do not run OpenClaw /compact. agy compacts its own conversation.",
  "Tool activity shown to the user is work agy already performed.",
].join(" ");

/** Provider SDK system-prompt contribution. Scoped to this provider by the host. */
export function antigravitySystemPromptContribution(ctx) {
  return ctx?.provider === ANTIGRAVITY_PROVIDER_ID
    ? { stablePrefix: ANTIGRAVITY_OPENCLAW_CONTEXT }
    : undefined;
}

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
const TOOL_FREE_AGENT_VERSION_MESSAGE =
  "Antigravity CLI 1.2.1 or newer is required for tool-free setup checks.";

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
    .replace(/\s+/g, " ")
    .trim();
  return output ? output.slice(0, 300) : "agy failed.";
}

function reconnectStepFailure(step, error) {
  return new Error(`Antigravity reconnect could not ${step}. (${describeCommandFailure(error)})`);
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
 * lists, with no `off`. Models that reject the flag offer only `off`.
 * Unknown models keep the generic profile.
 */
export function antigravityThinkingProfile(modelId, effortStore) {
  const levels = antigravityEffortLevels(modelId, effortStore);
  if (!levels) {
    return ANTIGRAVITY_THINKING_PROFILE;
  }
  if (levels.length === 0) {
    return { levels: [{ id: "off" }], defaultLevel: "off" };
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
  const effortStore = dependencies.effortStore;
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
    recordAntigravityModelEfforts(agyIds, effortStore);
    const ids = normalizeAntigravityModelIds(agyIds);
    liveModelCache = { at: now, ids };
    return ids;
  };

  const installToolFreeSetupAgent = async (context) => {
    throwIfAborted(context.signal);
    let version;
    try {
      version = await execute(command, ["--version"], context);
    } catch (error) {
      if (isAbortError(error, context.signal)) {
        throw error;
      }
      throw reconnectStepFailure("check the Antigravity CLI version", error);
    }
    throwIfAborted(context.signal);
    if (!supportsToolFreeSetupAgent(version)) {
      throw new Error(TOOL_FREE_AGENT_VERSION_MESSAGE);
    }
    try {
      await execute(command, ["plugin", "install", TOOL_FREE_SETUP_PLUGIN_ROOT], context);
    } catch (error) {
      if (isAbortError(error, context.signal)) {
        throw error;
      }
      throw reconnectStepFailure("install the tool-free setup agent", error);
    }
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

  const catalogOptionsFor = (config) => ({
    googleModels: googleModelsFrom(config),
    effortStore,
  });

  // On a successful reconnect, persist the endpoint and the model rows from
  // the `agy models` listing just fetched. A retired apiKey marker is dropped.
  // A non-array `models` value, such as `$include`, is left in place.
  // The patch stays on the provider catalog. `agents.defaults.models` is an
  // allowlist until model-policy migration, and copying refs there blocks every
  // other model. Setup also projects that map onto the selected agent's policy.
  const buildConnectionPatch = (config = {}, modelIds = []) => {
    const existing = config.models?.providers?.[ANTIGRAVITY_PROVIDER_ID] ?? {};
    const { models: existingModels, apiKey: existingApiKey, ...rest } = existing;
    const keepApiKey = isAntigravityAuthMarker(existingApiKey) ? undefined : existingApiKey;
    const keepModels =
      existingModels && typeof existingModels === "object" && !Array.isArray(existingModels)
        ? existingModels
        : undefined;
    const catalog = buildAntigravityModelCatalog(modelIds, catalogOptionsFor(config));
    return {
      models: {
        mode: config.models?.mode ?? "merge",
        providers: {
          [ANTIGRAVITY_PROVIDER_ID]: {
            ...rest,
            ...(keepApiKey !== undefined ? { apiKey: keepApiKey } : {}),
            baseUrl: ANTIGRAVITY_BASE_URL,
            api: ANTIGRAVITY_MODEL_API,
            models: keepModels ?? catalog,
          },
        },
      },
    };
  };

  // An empty profile list keeps the host from writing an auth profile. agy owns
  // the login; `prepareSyntheticAuth` reports whether that login is usable.
  const validatedResult = (modelRef, config, modelIds) => {
    return {
      profiles: [],
      defaultModel: modelRef,
      configPatch: buildConnectionPatch(config, modelIds),
    };
  };

  return {
    id: ANTIGRAVITY_PROVIDER_ID,
    label: "Antigravity CLI",
    // Aliases are published as their own provider catalogs. `agy` and
    // `antigravity` then appear beside `antigravity-cli`, each with the same
    // models and an API-key card.
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
            await installToolFreeSetupAgent(context);
            let available;
            try {
              available = await listModels({ ...context, refresh: true });
            } catch (error) {
              if (isAbortError(error, context.signal)) {
                throw error;
              }
              throw reconnectStepFailure("list models", error);
            }
            return available.includes(modelId)
              ? validatedResult(`${prefix}${modelId}`, context.config, available)
              : null;
          },
        },
        run: async (context) => {
          await installToolFreeSetupAgent(context);
          let modelIds;
          try {
            modelIds = await listModels({ ...context, refresh: true });
          } catch (error) {
            if (isAbortError(error, context.signal)) {
              throw error;
            }
            throw reconnectStepFailure("list models", error);
          }
          const modelId = chooseDetectedModel(modelIds);
          if (!modelId) {
            throw reconnectStepFailure("list models", new Error("agy listed no models."));
          }
          return validatedResult(
            `${ANTIGRAVITY_PROVIDER_ID}/${modelId}`,
            context.config,
            modelIds,
          );
        },
      },
    ],
    prepareSyntheticAuth: async (context = {}) => {
      try {
        const modelIds = await listModels(context);
        return modelIds.length > 0 ? antigravityNativeAuthResult() : undefined;
      } catch (error) {
        if (isAbortError(error, context.signal)) {
          throw error;
        }
        return undefined;
      }
    },
    shouldDeferSyntheticProfileAuth: (params) =>
      shouldDeferAntigravitySyntheticProfileAuth(params),
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
        // The host static catalog is the fallback. Returning it here would
        // label the snapshot as a live listing.
        return undefined;
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
    resolveThinkingProfile: (ctx) => antigravityThinkingProfile(ctx?.modelId, effortStore),
    resolveSystemPromptContribution: antigravitySystemPromptContribution,
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
        reasoning: antigravityModelReasons(resolved, effortStore),
        input: ["text"],
      };
    },
  };
}
