// Provider registration for Antigravity (`agy`).
//
// Auth is empty on purpose: agy holds the user's Antigravity OAuth session
// itself (`agy` login state), exactly as the gemini-cli runtime provider relies
// on the gemini CLI's own credentials. OpenClaw stores no key for this provider.
import { ANTIGRAVITY_BACKEND_ID } from "./cli-backend.js";
import {
  ANTIGRAVITY_DEFAULT_MODEL,
  ANTIGRAVITY_MODEL_ALIASES,
  buildAntigravityModelCatalog,
} from "./models.js";

export const ANTIGRAVITY_PROVIDER_ID = ANTIGRAVITY_BACKEND_ID;

export function buildAntigravityProvider() {
  return {
    id: ANTIGRAVITY_PROVIDER_ID,
    label: "Antigravity CLI",
    aliases: ["antigravity", "agy"],
    envVars: [],
    auth: [],
    staticCatalog: {
      order: "simple",
      run: async () => ({
        provider: {
          // No baseUrl or api: the CLI is the transport.
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
        input: ["text"],
      };
    },
  };
}
