import { buildAntigravityCliBackend } from "./cli-backend.js";
import { buildAntigravityProvider } from "./provider.js";

const ANTIGRAVITY_OPENCLAW_CONTEXT = [
  "You are running through OpenClaw's Antigravity CLI model provider.",
  "Use the installed `openclaw` CLI for OpenClaw operations and check its help before assuming command syntax.",
  "Use `mcporter` for external MCP servers it manages and check its help before assuming command syntax.",
  "Do not change global OpenClaw or mcporter configuration unless the user explicitly asks.",
].join(" ");

/** Shared by runtime entry and package-root setup-api. */
export function registerAntigravity(api) {
  const config = api?.pluginConfig ?? {};
  api.registerProvider(buildAntigravityProvider(config));
  api.registerCliBackend(buildAntigravityCliBackend(config));
  api.registerHook?.("before_prompt_build", (_event, context) =>
    context?.modelProviderId === "antigravity-cli"
      ? { prependContext: ANTIGRAVITY_OPENCLAW_CONTEXT }
      : undefined,
  );
}
