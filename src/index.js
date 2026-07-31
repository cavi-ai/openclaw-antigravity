// Antigravity CLI plugin — registers `agy` as an OpenClaw model provider backed
// by the Antigravity subscription, the slot gemini-cli used to fill.
import { buildAntigravityCliBackend } from "./cli-backend.js";
import { buildAntigravityProvider } from "./provider.js";

export const PLUGIN_ID = "antigravity";

export const plugin = {
  id: PLUGIN_ID,
  name: "Antigravity CLI",
  version: "0.1.0",
  description: "Runs Google's Antigravity CLI (agy) as a subscription-backed model provider.",
  register(api) {
    const config = api?.pluginConfig ?? {};
    api.registerProvider(buildAntigravityProvider());
    api.registerCliBackend(buildAntigravityCliBackend(config));
  },
};

export function register(api) {
  plugin.register(api);
}

export default plugin;
