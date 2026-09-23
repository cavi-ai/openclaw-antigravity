// Model catalog for Google's Antigravity CLI (`agy`).
//
// The static list is one OpenClaw id per model. `agy models` prints effort
// suffixes; those collapse here. Thinking level is `agy --effort`, limited to
// the levels agy lists for that model. Claude rejects the flag. Opus is sent to
// agy as `claude-opus-4-6-thinking`. Catalog rows are not written into OpenClaw
// config.

const EFFORT_SUFFIX = /-(?:high|medium|low)$/u;
const EFFORT_RANK = { minimal: 1, low: 1, medium: 2, high: 3, xhigh: 3, max: 3 };

/**
 * `--effort` levels each model accepts, from `agy models` on agy 1.2.8. agy
 * rejects a model with effort rows when the flag is missing or not listed, and
 * rejects the flag on models without effort rows. Live `agy models` overrides.
 */
const ANTIGRAVITY_MODEL_EFFORTS = {
  "gemini-3.8-flash": ["low", "medium", "high"],
  "gemini-3.7-flash": ["low", "medium", "high"],
  "gemini-3.6-flash": ["low", "medium", "high"],
  "gemini-3.1-pro": ["low", "high"],
  "claude-sonnet-4-6": [],
  "claude-opus-4-6": [],
  "gpt-oss-120b": ["medium"],
};

let liveModelEfforts = null;

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

/** Maps raw `agy models` ids to the effort levels each OpenClaw id accepts. */
export function effortLevelsFromAgyIds(agyIds) {
  const efforts = {};
  for (const raw of agyIds ?? []) {
    const agyId = typeof raw === "string" ? raw.trim().replace(/-thinking$/u, "") : "";
    const id = openClawModelId(agyId);
    if (!id) {
      continue;
    }
    const levels = efforts[id] ?? [];
    const level = agyId.slice(id.length + 1);
    if (level && !levels.includes(level)) {
      levels.push(level);
    }
    efforts[id] = levels.sort((a, b) => EFFORT_RANK[a] - EFFORT_RANK[b]);
  }
  return efforts;
}

/** Records the effort levels from the latest `agy models` listing. */
export function recordAntigravityModelEfforts(agyIds) {
  const efforts = effortLevelsFromAgyIds(agyIds);
  liveModelEfforts = Object.keys(efforts).length > 0 ? efforts : null;
}

/**
 * `--effort` levels agy accepts for a model: live listing, then the snapshot.
 * `[]` means the flag is rejected; `undefined` means the model is unknown.
 */
export function antigravityEffortLevels(modelId) {
  const id = openClawModelId(String(modelId ?? "").replace(/-thinking$/u, ""));
  return liveModelEfforts?.[id] ?? ANTIGRAVITY_MODEL_EFFORTS[id];
}

/** Effort used when OpenClaw sends no level: medium, else the highest listed. */
export function defaultAntigravityEffort(levels) {
  return levels.includes("medium") ? "medium" : levels.at(-1);
}

/**
 * Maps an OpenClaw thinking level to an `agy --effort` value the model accepts,
 * or `undefined` to omit the flag. `off` takes the lowest listed level because
 * agy has no off for models with effort rows. Other levels take the nearest
 * listed level; ties go up.
 *
 * @param {string | undefined} modelId
 * @param {string | null | undefined} thinkingLevel
 */
export function resolveAntigravityEffort(modelId, thinkingLevel) {
  const level = typeof thinkingLevel === "string" ? thinkingLevel.trim().toLowerCase() : "";
  const levels = antigravityEffortLevels(modelId);
  if (!levels) {
    return antigravityModelSupportsEffort(modelId) && ["low", "medium", "high"].includes(level)
      ? level
      : undefined;
  }
  if (levels.length === 0) {
    return undefined;
  }
  if (levels.includes(level)) {
    return level;
  }
  if (level === "off") {
    return levels[0];
  }
  const rank = EFFORT_RANK[level];
  if (rank === undefined) {
    return defaultAntigravityEffort(levels);
  }
  let nearest = levels[0];
  for (const candidate of levels) {
    if (Math.abs(EFFORT_RANK[candidate] - rank) <= Math.abs(EFFORT_RANK[nearest] - rank)) {
      nearest = candidate;
    }
  }
  return nearest;
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
  const words = [];
  for (const part of base.split("-").filter(Boolean)) {
    const previous = words.at(-1);
    // `claude-sonnet-4-6` is version 4.6, not two words.
    if (/^\d+$/u.test(part) && /^\d+(?:\.\d+)*$/u.test(previous ?? "")) {
      words[words.length - 1] = `${previous}.${part}`;
    } else if (part === "gpt") {
      words.push("GPT");
    } else if (part === "oss") {
      words.push("OSS");
    } else if (/^\d/.test(part)) {
      words.push(part);
    } else {
      words.push(part.charAt(0).toUpperCase() + part.slice(1));
    }
  }
  return words.join(" ");
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
