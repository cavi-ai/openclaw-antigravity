// Doctor contract auto-loaded from the plugin package root (or dist/).
// See OpenClaw doctor-contract-registry load paths.
import { ANTIGRAVITY_MODEL_API, RETIRED_ANTIGRAVITY_MODEL_API } from "./src/models.js";
import { isAntigravityAuthMarker } from "./src/session.js";

const ANTIGRAVITY_PROVIDER_ID = "antigravity-cli";
const LEGACY_PROFILE_PREFIXES = ["antigravity:", "agy:"];
const OWN_PROFILE_PROVIDERS = new Set([ANTIGRAVITY_PROVIDER_ID, "antigravity", "agy"]);

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

function isAntigravityAuthProfile(profileId, profile) {
  if (OWN_PROFILE_PROVIDERS.has(profile?.provider)) {
    return true;
  }
  if (typeof profile?.provider === "string" && profile.provider.length > 0) {
    return false;
  }
  const prefixes = sessionRouteStateOwners.flatMap((owner) => owner.authProfilePrefixes);
  return (
    prefixes.some((prefix) => profileId.startsWith(prefix)) ||
    LEGACY_PROFILE_PREFIXES.some((prefix) => profileId.startsWith(prefix))
  );
}

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
 * Drop a retired Antigravity provider apiKey marker and leftover auth-profile
 * bindings. agy owns the login. A config key or per-agent token is not it.
 *
 * @param {{ cfg?: object }} params
 */
export function normalizeCompatibilityConfig({ cfg } = {}) {
  const provider = cfg?.models?.providers?.[ANTIGRAVITY_PROVIDER_ID];
  const providerExists = Boolean(provider && typeof provider === "object");
  const markerKey = providerExists && isAntigravityAuthMarker(provider.apiKey);
  const retiredApi = providerExists && catalogUsesRetiredApi(provider);
  const profiles = cfg?.auth?.profiles;
  const staleProfileIds = Object.entries(profiles ?? {})
    .filter(([profileId, profile]) => isAntigravityAuthProfile(profileId, profile))
    .map(([profileId]) => profileId);
  const hasOrder = Boolean(
    cfg?.auth?.order && Object.hasOwn(cfg.auth.order, ANTIGRAVITY_PROVIDER_ID),
  );
  if (!markerKey && staleProfileIds.length === 0 && !hasOrder && !retiredApi) {
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
  if (staleProfileIds.length > 0) {
    for (const profileId of staleProfileIds) {
      delete config.auth.profiles[profileId];
    }
    if (Object.keys(config.auth.profiles).length === 0) {
      delete config.auth.profiles;
    }
    changes.push("Removed Antigravity auth profile bindings.");
  }
  if (hasOrder) {
    delete config.auth.order[ANTIGRAVITY_PROVIDER_ID];
    if (Object.keys(config.auth.order).length === 0) {
      delete config.auth.order;
    }
    changes.push("Removed Antigravity auth profile order.");
  }
  if (config.auth && Object.keys(config.auth).length === 0) {
    delete config.auth;
  }
  return { config, changes };
}
