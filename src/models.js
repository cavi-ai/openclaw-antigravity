// Model catalog for Google's Antigravity CLI (`agy`).
//
// The list mirrors `agy models` as of agy 1.1.25. agy publishes no machine-readable
// catalog, so ids are refreshed by hand — run `agy models` after an `agy update`
// and reconcile. Unknown ids still work: they are passed through to `--model`
// verbatim, so a new agy model is usable before it is listed here.

/** agy's own model ids, from `agy models`. */
export const ANTIGRAVITY_MODEL_IDS = [
  "gemini-3.8-flash-high",
  "gemini-3.8-flash-medium",
  "gemini-3.8-flash-low",
  "gemini-3.7-flash-high",
  "gemini-3.7-flash-medium",
  "gemini-3.7-flash-low",
  "gemini-3.6-flash-high",
  "gemini-3.6-flash-medium",
  "gemini-3.6-flash-low",
  "gemini-3.1-pro-high",
  "gemini-3.1-pro-low",
  "claude-sonnet-4-6",
  "claude-opus-4-6-thinking",
  "gpt-oss-120b-medium",
];

export const ANTIGRAVITY_DEFAULT_MODEL = "gemini-3.1-pro-high";

/**
 * Placeholder endpoint for the catalog row. `agy` owns the transport, so this is
 * never dialed; it exists because `baseUrl` is a required provider field and a
 * row without it breaks catalog assembly. Loopback keeps it classified as a
 * local endpoint rather than an unresolvable public host.
 */
export const ANTIGRAVITY_BASE_URL = "http://127.0.0.1/antigravity-cli";

/** Adapter recorded on catalog rows. Unused at runtime for the same reason. */
export const ANTIGRAVITY_MODEL_API = "openai-completions";

/**
 * Short names for the ids above. `agy` itself accepts only the full id, so these
 * are expanded by the CLI backend before launch.
 */
export const ANTIGRAVITY_MODEL_ALIASES = {
  pro: "gemini-3.1-pro-high",
  flash: "gemini-3.6-flash-medium",
  "flash-lite": "gemini-3.6-flash-low",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6-thinking",
  "gpt-oss": "gpt-oss-120b-medium",
};

// Context windows are conservative floors, not published figures — Antigravity
// documents no per-model limits for the CLI. They exist so OpenClaw budgets and
// compacts sanely; raise them if agy is observed accepting more.
const CONTEXT_WINDOW_FLOOR = {
  gemini: 1_000_000,
  claude: 200_000,
  other: 128_000,
};

function contextWindowFor(modelId) {
  if (modelId.startsWith("gemini-")) {
    return CONTEXT_WINDOW_FLOOR.gemini;
  }
  if (modelId.startsWith("claude-")) {
    return CONTEXT_WINDOW_FLOOR.claude;
  }
  return CONTEXT_WINDOW_FLOOR.other;
}

/** Turns an agy model id into a human label, e.g. `gemini-3.1-pro-high` → `Gemini 3.1 Pro (high)`. */
export function labelForModelId(modelId) {
  const match = /^(.*)-(high|medium|low|thinking)$/.exec(modelId);
  const base = match ? match[1] : modelId;
  const suffix = match ? match[2] : undefined;
  const words = base
    .split("-")
    .map((part) => {
      if (part === "gpt") return "GPT";
      if (part === "oss") return "OSS";
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
  return suffix ? `${words} (${suffix})` : words;
}

/** Builds the catalog entries OpenClaw shows in model pickers. */
export function buildAntigravityModelCatalog() {
  return ANTIGRAVITY_MODEL_IDS.map((id) => ({
    id,
    name: labelForModelId(id),
    api: ANTIGRAVITY_MODEL_API,
    // Thinking-tier ids and the pro tiers reason; the flash-low tiers do not
    // advertise it. Treat everything except the explicit `-low` tiers as reasoning.
    reasoning: !id.endsWith("-low"),
    input: ["text"],
    contextWindow: contextWindowFor(id),
    maxTokens: 64_000,
    // Antigravity is subscription-billed, not metered per token, so there is no
    // per-token price to report. Zero here means "not separately billed", and
    // keeps OpenClaw's cost accounting from inventing charges.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  }));
}
