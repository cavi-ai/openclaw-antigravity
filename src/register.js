import { buildAntigravityCliBackend } from "./cli-backend.js";
import { createAntigravityEffortStore } from "./models.js";
import { ANTIGRAVITY_PROVIDER_ID, buildAntigravityProvider } from "./provider.js";

/**
 * Control-plane catalog rows. `catalog` / `staticCatalog` remain the text
 * runtime source; this registrar is the current picker/list surface.
 *
 * @param {{ provider?: { models?: { id?: string, name?: string }[], defaultModel?: string } } | null | undefined} result
 * @param {"static" | "live"} source
 */
export function unifiedAntigravityCatalog(result, source) {
  const models = result?.provider?.models;
  if (!Array.isArray(models)) {
    return [];
  }
  const defaultModel = result.provider?.defaultModel;
  return models.flatMap((model) => {
    if (typeof model?.id !== "string" || model.id.length === 0) {
      return [];
    }
    return [
      {
        kind: "text",
        provider: ANTIGRAVITY_PROVIDER_ID,
        model: model.id,
        label: model.name,
        source,
        ...(model.id === defaultModel ? { default: true } : {}),
      },
    ];
  });
}

export async function loadAntigravityLiveCatalog(provider, ctx) {
  const result = await provider.catalog.run(ctx);
  return result ? unifiedAntigravityCatalog(result, "live") : [];
}

/** Shared by the runtime entry and the package-root setup entry. */
export function registerAntigravity(api) {
  const config = api?.pluginConfig ?? {};
  const effortStore = createAntigravityEffortStore();
  const provider = buildAntigravityProvider(config, { effortStore });
  api.registerProvider(provider);
  api.registerCliBackend(buildAntigravityCliBackend(config, effortStore));
  api.registerModelCatalogProvider({
    provider: ANTIGRAVITY_PROVIDER_ID,
    kinds: ["text"],
    staticCatalog: async () => unifiedAntigravityCatalog(await provider.staticCatalog.run(), "static"),
    liveCatalog: (ctx) => loadAntigravityLiveCatalog(provider, ctx),
  });
}
