// Model catalog for Google's Antigravity CLI (`agy`).
//
// The static list is one OpenClaw id per model. `agy models` prints effort
// suffixes; those collapse here. Thinking level is `agy --effort`, except
// Claude, which rejects that flag. Opus is sent to agy as
// `claude-opus-4-6-thinking`. Catalog rows are not written into OpenClaw config.

const EFFORT_SUFFIX = /-(?:high|medium|low)$/u;

/**
 * agy ids that are not the OpenClaw id. Claude Opus is only recognized as
 * `claude-opus-4-6-thinking`, and `--effort` is rejected for Claude models.
 */
const TRANSPORT_MODEL_IDS = {
  "claude-opus-4-6": "claude-opus-4-6-thinking",
};

/** OpenClaw catalog ids. One row per model; effort is not part of the id. */
export const ANTIGRAVITY_MODEL_IDS = [
  "gemini-3.8-flash",
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.1-pro",
  "claude-sonnet-4-6",
  "claude-opus-4-6",
  "gpt-oss-120b",
];

export const ANTIGRAVITY_DEFAULT_MODEL = "gemini-3.1-pro";

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
  pro: "gemini-3.1-pro",
  flash: "gemini-3.8-flash",
  "flash-lite": "gemini-3.8-flash",
  sonnet: "claude-sonnet-4-6",
  opus: "claude-opus-4-6",
  "gpt-oss": "gpt-oss-120b",
};

/** Drops an effort suffix. `-thinking` stays until transport resolution. */
export function openClawModelId(modelId) {
  const id = typeof modelId === "string" ? modelId.trim() : "";
  return id.replace(EFFORT_SUFFIX, "");
}

/** Collapses effort-qualified `agy models` rows into OpenClaw catalog ids. */
export function normalizeAntigravityModelIds(modelIds) {
  const ids = [];
  for (const raw of modelIds ?? []) {
    const agyId = typeof raw === "string" ? raw.trim() : "";
    const id = openClawModelId(agyId.replace(/-thinking$/u, ""));
    if (!id || ids.includes(id)) {
      continue;
    }
    ids.push(id);
  }
  return ids;
}

/**
 * Model id passed to `agy --model`. Gemini and GPT-OSS use the OpenClaw id.
 * Claude Opus is sent as the only id agy recognizes.
 */
export function resolveAntigravityTransportModelId(modelId) {
  const id = openClawModelId(String(modelId ?? "").replace(/-thinking$/u, ""));
  return TRANSPORT_MODEL_IDS[id] ?? id;
}

/** Claude models reject `agy --effort`. Gemini and GPT-OSS accept it. */
export function antigravityModelSupportsEffort(modelId) {
  return !openClawModelId(modelId).startsWith("claude-");
}

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

/** Turns an OpenClaw model id into a human label, e.g. `gemini-3.1-pro` → `Gemini 3.1 Pro`. */
export function labelForModelId(modelId) {
  const base = openClawModelId(String(modelId ?? "").replace(/-thinking$/u, ""));
  return base
    .split("-")
    .filter(Boolean)
    .map((part) => {
      if (part === "gpt") return "GPT";
      if (part === "oss") return "OSS";
      if (/^\d/.test(part)) return part;
      return part.charAt(0).toUpperCase() + part.slice(1);
    })
    .join(" ");
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
  const ids = normalizeAntigravityModelIds(modelIds);
  return (ids.length > 0 ? ids : ANTIGRAVITY_MODEL_IDS).map(catalogEntryForModelId);
}
