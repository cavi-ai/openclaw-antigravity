// Provider registration for Antigravity (`agy`).
//
// Auth is empty on purpose: agy holds the user's Antigravity OAuth session
// itself (`agy` login state), exactly as the gemini-cli runtime provider relies
// on the gemini CLI's own credentials. OpenClaw stores no key for this provider.
import { ANTIGRAVITY_BACKEND_ID } from "./cli-backend.js";
import {
  ANTIGRAVITY_BASE_URL,
  ANTIGRAVITY_DEFAULT_MODEL,
  ANTIGRAVITY_MODEL_ALIASES,
  ANTIGRAVITY_MODEL_API,
  buildAntigravityModelCatalog,
} from "./models.js";

export const ANTIGRAVITY_PROVIDER_ID = ANTIGRAVITY_BACKEND_ID;

const MISSING_AUTH_MESSAGE =
  "Antigravity CLI is not ready. Install Google's Antigravity CLI (`agy`), sign in with your Google subscription, then confirm with `agy models`. This provider stores no API key in OpenClaw.";

export function buildAntigravityProvider() {
  return {
    id: ANTIGRAVITY_PROVIDER_ID,
    label: "Antigravity CLI",
    aliases: ["antigravity", "agy"],
    envVars: [],
    auth: [],
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
