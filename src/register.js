import { buildAntigravityCliBackend } from "./cli-backend.js";
import { buildAntigravityProvider } from "./provider.js";

const ANTIGRAVITY_OPENCLAW_CONTEXT = [
  "You are running through OpenClaw's Antigravity CLI model provider.",
  "Use the installed `openclaw` CLI for OpenClaw operations and check its help before assuming command syntax.",
  "Use `mcporter` for external MCP servers it manages and check its help before assuming command syntax.",
  "Do not change global OpenClaw or mcporter configuration unless the user explicitly asks.",
].join(" ");

function injectOpenClawGuidance(_event, context) {
  return context?.modelProviderId === "antigravity-cli"
    ? { prependContext: ANTIGRAVITY_OPENCLAW_CONTEXT }
    : undefined;
}

/** Shared by runtime entry and package-root setup-api. */
export function registerAntigravity(api) {
  const config = api?.pluginConfig ?? {};
  api.registerProvider(buildAntigravityProvider(config));
  api.registerCliBackend(buildAntigravityCliBackend(config));
  // Typed lifecycle hooks only fire through api.on. registerHook("before_prompt_build")
  // is ignored, and without opts.name it throws and aborts the whole plugin.
  api.on?.("before_prompt_build", injectOpenClawGuidance);
}
