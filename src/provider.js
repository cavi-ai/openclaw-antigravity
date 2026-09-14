// Provider registration for Antigravity (`agy`).
//
// agy owns the user's Antigravity OAuth session. Guided discovery/reconnect
// validates that CLI-owned session and records the provider's non-secret
// connection (models, endpoint) in config; OpenClaw stores no key for this provider.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { ANTIGRAVITY_BACKEND_ID } from "./cli-backend.js";
import {
  ANTIGRAVITY_BASE_URL,
  ANTIGRAVITY_DEFAULT_MODEL,
  ANTIGRAVITY_MODEL_ALIASES,
  ANTIGRAVITY_MODEL_API,
  buildAntigravityModelCatalog,
} from "./models.js";

export const ANTIGRAVITY_PROVIDER_ID = ANTIGRAVITY_BACKEND_ID;
const execFileAsync = promisify(execFile);
const COMMAND_TIMEOUT_MS = 15_000;
const COMMAND_MAX_BUFFER_BYTES = 1_048_576;

const MISSING_AUTH_MESSAGE =
  "Antigravity CLI is not ready. Install Google's Antigravity CLI (`agy`), sign in with your Google subscription, then confirm with `agy models`. This provider stores no API key in OpenClaw.";
const RECONNECT_ERROR_MESSAGE =
  "Antigravity CLI could not list models. Run `agy` in a terminal to sign in, then choose Reconnect again. OpenClaw stores no Antigravity credential.";

async function runCommand(command, args, context = {}) {
  const result = await execFileAsync(command, args, {
    env: context.env,
    signal: context.signal,
    timeout: COMMAND_TIMEOUT_MS,
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

/**
 * @param {{command?: string}} [options]
 * @param {{runCommand?: typeof runCommand}} [dependencies]
 */
export function buildAntigravityProvider(options = {}, dependencies = {}) {
  const command = options.command?.trim() || "agy";
  const execute = dependencies.runCommand ?? runCommand;

  const listModels = async (context) => {
    throwIfAborted(context.signal);
    const output = await execute(command, ["models"], context);
    throwIfAborted(context.signal);
    return parseAntigravityModelIds(output);
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

  // On a successful reconnect, hand OpenClaw a non-secret config patch so the
  // provider's endpoint and model catalog persist. Shape matches the provider
  // connection contract other CLI backends use (`configPatch.models.providers`).
  const buildConnectionPatch = (config = {}) => {
    const existing = config.models?.providers?.[ANTIGRAVITY_PROVIDER_ID] ?? {};
    return {
      models: {
        mode: config.models?.mode ?? "merge",
        providers: {
          [ANTIGRAVITY_PROVIDER_ID]: {
            ...existing,
            baseUrl: ANTIGRAVITY_BASE_URL,
            api: ANTIGRAVITY_MODEL_API,
            models:
              Array.isArray(existing.models) && existing.models.length > 0
                ? existing.models
                : buildAntigravityModelCatalog(),
          },
        },
      },
    };
  };

  const validatedResult = (modelRef, config) => ({
    profiles: [],
    defaultModel: modelRef,
    configPatch: buildConnectionPatch(config),
  });

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
              await execute(command, ["--version"], context);
              throwIfAborted(context.signal);
              return true;
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
            const modelId = context.modelRef.slice(prefix.length);
            try {
              const available = await listModels(context);
              return available.includes(modelId)
                ? validatedResult(context.modelRef, context.config)
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
          const detected = await detect(context);
          if (!detected) {
            throw new Error(RECONNECT_ERROR_MESSAGE);
          }
          return validatedResult(detected.modelRef, context.config);
        },
      },
    ],
    buildMissingAuthMessage: () => MISSING_AUTH_MESSAGE,
    buildAuthDoctorHint: () => MISSING_AUTH_MESSAGE,
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
    // agy accepts model ids this catalog has not caught up with. Rather than
    // fail the run, pass an unknown id straight through to `--model`.
    resolveDynamicModel: (ctx) => {
      const modelId = typeof ctx?.modelId === "string" ? ctx.modelId.trim() : "";
      if (!modelId) {
        return null;
      }
      const resolved = ANTIGRAVITY_MODEL_ALIASES[modelId] ?? modelId;
      return {
        id: resolved,
        provider: ANTIGRAVITY_PROVIDER_ID,
        name: resolved,
        api: ANTIGRAVITY_MODEL_API,
        baseUrl: ANTIGRAVITY_BASE_URL,
        input: ["text"],
      };
    },
  };
}
