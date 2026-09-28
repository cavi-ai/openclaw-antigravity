import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
import { definePluginEntry } from "openclaw/plugin-sdk/plugin-entry";
import setupApi from "../setup-api.js";
import { sessionRouteStateOwners } from "../doctor-contract-api.js";
import { PLUGIN_ID, plugin } from "../src/index.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "openclaw.plugin.json"), "utf8"));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

test("manifest omits invalid PluginKind and owns antigravity-cli", () => {
  assert.equal(manifest.id, "antigravity");
  assert.equal(manifest.kind, undefined);
  assert.equal(manifest.activation.onStartup, true);
  assert.deepEqual(manifest.providers, ["antigravity-cli"]);
  assert.deepEqual(manifest.cliBackends, ["antigravity-cli"]);
  assert.deepEqual(manifest.syntheticAuthRefs, ["antigravity-cli"]);
  assert.equal(manifest.contracts, undefined);
  assert.equal(manifest.modelCatalog.discovery["antigravity-cli"], "refreshable");
  assert.deepEqual(manifest.autoEnableWhenConfiguredProviders, ["antigravity-cli"]);
  assert.deepEqual(manifest.setup.cliBackends, ["antigravity-cli"]);
  assert.equal(manifest.setup.providers[0].id, "antigravity-cli");
});
test("manifest exposes guided discovery reconnect without a credential-only login", () => {
  const choice = manifest.providerAuthChoices[0];
  assert.equal(choice.provider, "antigravity-cli");
  assert.equal(choice.method, "cli");
  assert.equal(choice.choiceId, "antigravity-cli");
  assert.notEqual(choice.provider, "google-antigravity");
  assert.ok(choice.choiceHint.includes("agy"));
  assert.equal(choice.credentialOnly, undefined);
  assert.equal(choice.appGuidedDiscovery, true);
  assert.equal(choice.appGuidedActionLabel, "Reconnect");
});

test("configSchema rejects unknown keys", () => {
  assert.equal(manifest.configSchema.additionalProperties, false);
  assert.ok(manifest.uiHints.skipPermissions.help.includes("dangerously-skip-permissions"));
});

test("package.json is ClawHub-ready and ships setup/doctor modules", () => {
  assert.equal(manifest.version, pkg.version);
  assert.equal(pkg.version, "0.3.0");
  assert.equal(plugin.version, undefined);
  assert.equal(plugin.id, manifest.id);
  assert.equal(plugin.name, manifest.name);
  assert.deepEqual(plugin.configSchema, manifest.configSchema);
  assert.equal(pkg.openclaw.compat.pluginApi, ">=2026.9.6");
  assert.equal(pkg.openclaw.compat.minGatewayVersion, "2026.9.6");
  assert.equal(pkg.openclaw.build.openclawVersion, "2026.9.6");
  assert.equal(pkg.openclaw.build.pluginSdkVersion, "2026.9.6");
  assert.equal(pkg.peerDependencies.openclaw, ">=2026.9.6");
  assert.equal(pkg.devDependencies.openclaw, "2026.9.6");
  assert.equal(pkg.name, "@cavi-ai/antigravity");
  assert.equal(pkg.openclaw.install.npmSpec, "@cavi-ai/antigravity");
  assert.equal(pkg.openclaw.install.minHostVersion, ">=2026.9.6");
  assert.ok(pkg.files.includes("setup-api.js"));
  assert.ok(pkg.files.includes("doctor-contract-api.js"));
  assert.ok(pkg.files.includes("openclaw.plugin.json"));
  assert.ok(pkg.files.includes("scripts/check-host-integration.mjs"));
});

test("setup-api registers provider, CLI backend, and model catalog", () => {
  const calls = [];
  setupApi.register({
    registerProvider: (p) => calls.push(["provider", p.id]),
    registerCliBackend: (b) => calls.push(["cli-backend", b.id]),
    registerModelCatalogProvider: (entry) => calls.push(["catalog", entry.provider, ...entry.kinds]),
  });
  assert.equal(setupApi.id, PLUGIN_ID);
  assert.deepEqual(calls, [
    ["provider", "antigravity-cli"],
    ["cli-backend", "antigravity-cli"],
    ["catalog", "antigravity-cli", "text"],
  ]);
});

test("setup-api tolerates missing pluginConfig", () => {
  let command;
  setupApi.register({
    registerProvider: () => {},
    registerCliBackend: (b) => {
      command = b.config.command;
    },
    registerModelCatalogProvider: () => {},
  });
  assert.match(command, /(^|[\\/])agy(\.exe)?$/u);
});

test("doctor contract owns antigravity-cli session routes", () => {
  assert.equal(sessionRouteStateOwners.length, 1);
  const owner = sessionRouteStateOwners[0];
  assert.ok(owner.providerIds.includes("antigravity-cli"));
  assert.ok(owner.runtimeIds.includes("antigravity-cli"));
  assert.ok(owner.cliSessionKeys.includes("antigravity-cli"));
  assert.ok(owner.authProfilePrefixes.some((p) => p.startsWith("antigravity-cli:")));
});

test("runtime entry is definePluginEntry from the provider SDK", () => {
  const sample = definePluginEntry({
    id: "sample",
    name: "Sample",
    description: "Sample",
    register() {},
  });
  assert.deepEqual(Object.keys(plugin).sort(), Object.keys(sample).sort());
  assert.equal(plugin, setupApi);
  const source = readFileSync(join(root, "src/index.js"), "utf8");
  assert.match(source, /from "openclaw\/plugin-sdk\/plugin-entry"/u);
  assert.doesNotMatch(readFileSync(join(root, "src/register.js"), "utf8"), /before_prompt_build/u);
});

test("runtime plugin id stays antigravity", () => {
  assert.equal(plugin.id, "antigravity");
  assert.ok(!String(pathToFileURL(join(root, "doctor-contract-api.js"))).includes("/src/"));
});
