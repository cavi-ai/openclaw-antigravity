import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import manifest from "../openclaw.plugin.json" with { type: "json" };
import { registerAntigravity } from "./register.js";

export const PLUGIN_ID = "antigravity";

export const plugin = definePluginEntry({
  id: PLUGIN_ID,
  name: manifest.name,
  description: manifest.description,
  configSchema: manifest.configSchema,
  register: registerAntigravity,
});

export function register(api) {
  plugin.register(api);
}

export default plugin;
