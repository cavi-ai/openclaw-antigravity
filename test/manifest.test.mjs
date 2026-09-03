import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath, pathToFileURL } from "node:url";
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
  assert.deepEqual(manifest.autoEnableWhenConfiguredProviders, ["antigravity-cli"]);
  assert.deepEqual(manifest.setup.cliBackends, ["antigravity-cli"]);
  assert.equal(manifest.setup.providers[0].id, "antigravity-cli");
});
test("manifest exposes a concrete CLI auth choice for onboarding", () => {
  const choice = manifest.providerAuthChoices[0];
  assert.equal(choice.provider, "antigravity-cli");
  assert.equal(choice.method, "cli");
  assert.equal(choice.choiceId, "antigravity-cli");
  assert.notEqual(choice.provider, "google-antigravity");
  assert.ok(choice.choiceHint.includes("agy"));
  assert.equal(choice.appGuidedDiscovery, true);
  assert.equal(choice.appGuidedActionLabel, "Reconnect");
});

test("configSchema rejects unknown keys", () => {
  assert.equal(manifest.configSchema.additionalProperties, false);
  assert.ok(manifest.uiHints.skipPermissions.help.includes("dangerously-skip-permissions"));
});

test("package.json is ClawHub-ready and ships setup/doctor modules", () => {
  assert.ok(pkg.openclaw.compat.pluginApi);
  assert.ok(pkg.openclaw.compat.minGatewayVersion);
  assert.ok(pkg.openclaw.build.openclawVersion);
  assert.ok(pkg.openclaw.build.pluginSdkVersion);
  assert.equal(pkg.name, "@cavi-ai/antigravity");
  assert.equal(pkg.openclaw.install.npmSpec, "@cavi-ai/antigravity");
  assert.equal(pkg.openclaw.install.minHostVersion, ">=2026.7.0");
  assert.ok(pkg.files.includes("setup-api.js"));
  assert.ok(pkg.files.includes("doctor-contract-api.js"));
  assert.ok(pkg.files.includes("openclaw.plugin.json"));
});

test("setup-api registers provider and CLI backend", () => {
  const calls = [];
  setupApi.register({
    registerProvider: (p) => calls.push(["provider", p.id]),
    registerCliBackend: (b) => calls.push(["cli-backend", b.id]),
  });
  assert.equal(setupApi.id, PLUGIN_ID);
  assert.deepEqual(calls, [
    ["provider", "antigravity-cli"],
    ["cli-backend", "antigravity-cli"],
  ]);
});

test("setup-api tolerates missing pluginConfig", () => {
  let command;
  setupApi.register({
    registerProvider: () => {},
    registerCliBackend: (b) => {
      command = b.config.command;
    },
  });
  assert.equal(command, "agy");
});

test("doctor contract owns antigravity-cli session routes", () => {
  assert.equal(sessionRouteStateOwners.length, 1);
  const owner = sessionRouteStateOwners[0];
  assert.ok(owner.providerIds.includes("antigravity-cli"));
  assert.ok(owner.runtimeIds.includes("antigravity-cli"));
  assert.ok(owner.cliSessionKeys.includes("antigravity-cli"));
  assert.ok(owner.authProfilePrefixes.some((p) => p.startsWith("antigravity-cli:")));
});

test("runtime plugin id stays antigravity", () => {
  assert.equal(plugin.id, "antigravity");
  assert.ok(!String(pathToFileURL(join(root, "doctor-contract-api.js"))).includes("/src/"));
});
