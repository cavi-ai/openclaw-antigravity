// Antigravity CLI plugin — registers `agy` as an OpenClaw model provider backed
// by the Antigravity subscription, the slot gemini-cli used to fill.
import { registerAntigravity } from "./register.js";

export const PLUGIN_ID = "antigravity";

export const plugin = {
  id: PLUGIN_ID,
  name: "Antigravity CLI",
  version: "0.3.0",
  description: "Runs Google's Antigravity CLI (agy) as a subscription-backed model provider.",
  register: registerAntigravity,
};

export function register(api) {
  plugin.register(api);
}

export default plugin;
