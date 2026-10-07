// Doctor contract auto-loaded from the plugin package root (or dist/).
// See OpenClaw doctor-contract-registry load paths.
import { isAntigravityAuthMarker } from "./src/session.js";

const ANTIGRAVITY_PROVIDER_ID = "antigravity-cli";

export const sessionRouteStateOwners = [
  {
    id: "antigravity",
    label: "Antigravity CLI",
    providerIds: ["antigravity-cli"],
    runtimeIds: ["antigravity-cli"],
    cliSessionKeys: ["antigravity-cli", "antigravity", "agy"],
    authProfilePrefixes: ["antigravity-cli:", "antigravity:", "agy:"],
  },
];

function isAntigravityAuthProfile(profileId, profile) {
  const prefixes = sessionRouteStateOwners.flatMap((owner) => owner.authProfilePrefixes);
  return (
    prefixes.some((prefix) => profileId.startsWith(prefix)) ||
    profile?.provider === ANTIGRAVITY_PROVIDER_ID
  );
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
  const profiles = cfg?.auth?.profiles;
  const staleProfileIds = Object.entries(profiles ?? {})
    .filter(([profileId, profile]) => isAntigravityAuthProfile(profileId, profile))
    .map(([profileId]) => profileId);
  const hasOrder = Boolean(
    cfg?.auth?.order && Object.hasOwn(cfg.auth.order, ANTIGRAVITY_PROVIDER_ID),
  );
  if (!markerKey && staleProfileIds.length === 0 && !hasOrder) {
    return { config: cfg, changes: [] };
  }

  const config = structuredClone(cfg);
  const changes = [];
  if (markerKey) {
    delete config.models.providers[ANTIGRAVITY_PROVIDER_ID].apiKey;
    changes.push("Removed the Antigravity provider apiKey marker. agy owns the login.");
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
