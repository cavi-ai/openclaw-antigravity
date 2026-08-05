import { buildAntigravityCliBackend } from "./cli-backend.js";
import { buildAntigravityProvider } from "./provider.js";

/** Shared by runtime entry and package-root setup-api. */
export function registerAntigravity(api) {
  const config = api?.pluginConfig ?? {};
  api.registerProvider(buildAntigravityProvider());
  api.registerCliBackend(buildAntigravityCliBackend(config));
}
