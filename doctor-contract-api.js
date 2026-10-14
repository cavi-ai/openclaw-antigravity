// Doctor contract auto-loaded from the plugin package root (or dist/).
// See OpenClaw doctor-contract-registry load paths.
import { ANTIGRAVITY_MODEL_API, RETIRED_ANTIGRAVITY_MODEL_API } from "./src/models.js";
import { isAntigravityAuthMarker } from "./src/session.js";

const ANTIGRAVITY_PROVIDER_ID = "antigravity-cli";

export const sessionRouteStateOwners = [
  {
    id: "antigravity",
    label: "Antigravity CLI",
    providerIds: ["antigravity-cli"],
    runtimeIds: ["antigravity-cli"],
    cliSessionKeys: ["antigravity-cli", "antigravity", "agy"],
    authProfilePrefixes: ["antigravity-cli:"],
  },
];

function catalogUsesRetiredApi(provider) {
  if (provider?.api === RETIRED_ANTIGRAVITY_MODEL_API) {
    return true;
  }
  return (
    Array.isArray(provider?.models) &&
    provider.models.some((model) => model?.api === RETIRED_ANTIGRAVITY_MODEL_API)
  );
}

function rewriteRetiredCatalogApi(provider) {
  let changed = false;
  if (provider.api === RETIRED_ANTIGRAVITY_MODEL_API) {
    provider.api = ANTIGRAVITY_MODEL_API;
    changed = true;
  }
  if (!Array.isArray(provider.models)) {
    return changed;
  }
  for (const model of provider.models) {
    if (model?.api === RETIRED_ANTIGRAVITY_MODEL_API) {
      model.api = ANTIGRAVITY_MODEL_API;
      changed = true;
    }
  }
  return changed;
}

/**
 * Drop retired provider config markers and migrate the catalog API. Saved
 * profile bindings and order belong to the host and must survive Reconnect.
 *
 * @param {{ cfg?: object }} params
 */
export function normalizeCompatibilityConfig({ cfg } = {}) {
  const provider = cfg?.models?.providers?.[ANTIGRAVITY_PROVIDER_ID];
  const providerExists = Boolean(provider && typeof provider === "object");
  const markerKey = providerExists && isAntigravityAuthMarker(provider.apiKey);
  const retiredApi = providerExists && catalogUsesRetiredApi(provider);
  if (!markerKey && !retiredApi) {
    return { config: cfg, changes: [] };
  }

  const config = structuredClone(cfg);
  const changes = [];
  if (markerKey) {
    delete config.models.providers[ANTIGRAVITY_PROVIDER_ID].apiKey;
    changes.push("Removed the Antigravity provider apiKey marker. agy owns the login.");
  }
  if (retiredApi && rewriteRetiredCatalogApi(config.models.providers[ANTIGRAVITY_PROVIDER_ID])) {
    changes.push("Recorded the Antigravity catalog api as a non-HTTP adapter.");
  }
  return { config, changes };
}
