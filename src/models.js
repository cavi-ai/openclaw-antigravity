// Model catalog for Google's Antigravity CLI (`agy`).
//
// The static list is the last known `agy models` snapshot. Live discovery
// returns the ids the signed-in CLI reports. Those ids are not written into
// OpenClaw config. Unknown ids still pass through to `--model` verbatim.

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
  flash: "gemini-3.8-flash-medium",
  "flash-lite": "gemini-3.8-flash-low",
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

/** Builds one picker row for an agy model id. */
export function catalogEntryForModelId(modelId) {
  return {
    id: modelId,
    name: labelForModelId(modelId),
    api: ANTIGRAVITY_MODEL_API,
    // Capability flag only. The selected thinking level is a separate param
    // mapped to `agy --effort`, not a suffix of this id.
    reasoning: true,
    input: ["text"],
    contextWindow: contextWindowFor(modelId),
    maxTokens: 64_000,
    // Antigravity is subscription-billed, not metered per token, so there is no
    // per-token price to report. Zero here means "not separately billed", and
    // keeps OpenClaw's cost accounting from inventing charges.
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
  };
}

/**
 * Builds the catalog entries OpenClaw shows in model pickers.
 *
 * @param {string[]} [modelIds]
 */
export function buildAntigravityModelCatalog(modelIds = ANTIGRAVITY_MODEL_IDS) {
  const ids = [];
  for (const raw of modelIds) {
    const id = typeof raw === "string" ? raw.trim() : "";
    if (!id || ids.includes(id)) {
      continue;
    }
    ids.push(id);
  }
  return (ids.length > 0 ? ids : ANTIGRAVITY_MODEL_IDS).map(catalogEntryForModelId);
}
