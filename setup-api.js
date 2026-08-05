// Lightweight setup entry. OpenClaw discovers package-root `setup-api.js`
// for descriptor-backed setup without loading the full runtime entry.
import { buildAntigravityCliBackend } from "./src/cli-backend.js";
import { buildAntigravityProvider } from "./src/provider.js";

export default {
  id: "antigravity",
  name: "Antigravity CLI Setup",
  description: "Setup hooks for the Antigravity CLI provider.",
  register(api) {
    const config = api?.pluginConfig ?? {};
    api.registerProvider(buildAntigravityProvider());
    api.registerCliBackend(buildAntigravityCliBackend(config));
  },
};
