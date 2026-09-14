import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

const ROOT = path.resolve(import.meta.dirname, "../..");
const SOURCE = path.join(ROOT, "docs/antigravity/source");
const COMMIT = "0123456789abcdef0123456789abcdef01234567";

test("release identity follows npm and OpenClaw compatibility contracts", async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  const changelog = await readFile(path.join(ROOT, "CHANGELOG.md"), "utf8");
  const {
    DOCUMENTED_VERSION,
    NPM_PACKAGE_NAME,
    PRODUCT_ID,
    RELEASE_REPOSITORY,
    resolveReleaseIdentity,
  } = await import("./lib.mjs");
  const release = resolveReleaseIdentity({
    version: "0.2.2",
    tag: "v0.2.2",
    commit: COMMIT,
    sourceDateEpoch: 1700000000,
  });
  assert.deepEqual({
    package: NPM_PACKAGE_NAME,
    repository: RELEASE_REPOSITORY,
    slug: PRODUCT_ID,
    tag: release.tag,
    version: DOCUMENTED_VERSION,
  }, {
    package: "@cavi-ai/antigravity",
    repository: "cavi-ai/openclaw-antigravity",
    slug: "antigravity",
    tag: "v0.2.2",
    version: "0.2.2",
  });
  assert.equal(DOCUMENTED_VERSION, pkg.version);
  assert.ok(changelog.includes(`## ${pkg.version}`));
  assert.equal(NPM_PACKAGE_NAME, pkg.name);
  assert.equal(pkg.repository.url, "git+https://github.com/cavi-ai/openclaw-antigravity.git");
  assert.equal(pkg.peerDependencies.openclaw, ">=2026.7.0");
  assert.equal(pkg.openclaw.install.minHostVersion, ">=2026.7.0");
  assert.equal(pkg.openclaw.compat.pluginApi, ">=2026.7");
  assert.equal(pkg.openclaw.compat.minGatewayVersion, "2026.7.0");
});

test("navigation references every official source page exactly once", async () => {
  const navigation = JSON.parse(await readFile(path.join(SOURCE, "navigation.json"), "utf8"));
  const paths = navigation.sections.flatMap((section) => section.pages.map((page) => page.path));
  assert.equal(navigation.title, "Antigravity");
  assert.equal(paths.length, 10);
  assert.equal(new Set(paths).size, paths.length);
  assert.deepEqual(paths, [
    "introduction/overview.md",
    "introduction/installation.md",
    "introduction/quickstart.md",
    "guides/configuration.md",
    "guides/authentication.md",
    "guides/troubleshooting.md",
    "reference/models.md",
    "reference/doctor-and-compatibility.md",
    "security/trust-boundary.md",
    "release/version-and-support.md",
  ]);
  for (const relative of paths) {
    assert.ok(await readFile(path.join(SOURCE, "pages", relative), "utf8"));
  }
});

test("official docs cover install, compatibility, ownership, doctor, and auth recovery", async () => {
  const { resolveReleaseIdentity, stampReleaseTokens } = await import("./lib.mjs");
  const release = resolveReleaseIdentity({
    version: "0.2.2",
    tag: "v0.2.2",
    commit: COMMIT,
    sourceDateEpoch: 1700000000,
  });
  const navigation = JSON.parse(await readFile(path.join(SOURCE, "navigation.json"), "utf8"));
  const pages = await Promise.all(navigation.sections.flatMap((section) => section.pages).map((page) => (
    readFile(path.join(SOURCE, "pages", page.path), "utf8")
  )));
  const text = pages.map((page) => stampReleaseTokens(page, release)).join("\n");
  for (const phrase of [
    "npm install -g @cavi-ai/antigravity",
    "OpenClaw `2026.7`",
    "Gateway `2026.7.0`",
    "plugin API `2026.7`",
    "antigravity-cli/<model>",
    "`agy` owns inference and authentication",
    "stores no API key",
    "agy models",
    "doctor cannot repair discovery",
    "sign in through `agy`",
  ]) {
    assert.ok(text.includes(phrase), phrase);
  }
  assert.doesNotMatch(text, /OpenClaw (?:owns|stores).*Antigravity (?:OAuth|login|credentials)/iu);
});

test("package exposes documentation commands and release workflow runs every gate before dispatch", async () => {
  const pkg = JSON.parse(await readFile(path.join(ROOT, "package.json"), "utf8"));
  assert.deepEqual({
    build: pkg.scripts["docs:build"],
    release: pkg.scripts["docs:release"],
    test: pkg.scripts["docs:test"],
    verify: pkg.scripts["docs:verify"],
  }, {
    build: "node scripts/docs/build.mjs",
    release: "node scripts/docs/release-artifact.mjs",
    test: "node --test scripts/docs/*.test.mjs",
    verify: "node scripts/docs/verify.mjs",
  });

  const workflow = await readFile(path.join(ROOT, ".github/workflows/publish-docs.yml"), "utf8");
  for (const phrase of [
    "release:",
    "types: [published]",
    "npm test",
    "npm pack --dry-run",
    "npm run docs:test",
    "npm run docs:build --",
    "npm run docs:verify --",
    "antigravity-docs-${TAG}.tar.gz",
    "$DIRECTORY/$ARTIFACT.sha256",
    "cmp --silent",
    "CONSUMER_DISPATCH_TOKEN",
  ]) {
    assert.ok(workflow.includes(phrase), phrase);
  }
  assert.ok(workflow.indexOf("npm test") < workflow.indexOf("npm run docs:build --"));
  assert.ok(workflow.indexOf("npm run docs:verify --") < workflow.indexOf("gh api --method POST"));
  assert.match(workflow, /npm run --silent docs:release --[^\n]+> "\$envelope"/u);
  assert.match(workflow, /GITHUB_SHA: \$\{\{ github\.sha \}\}/u);
  assert.match(workflow, /tag_commit/u);
  const actionRefs = [...workflow.matchAll(/uses: actions\/(?:checkout|setup-node)@([^\s]+)/gu)]
    .map((match) => match[1]);
  assert.equal(actionRefs.length, 2);
  assert.ok(actionRefs.every((ref) => /^[a-f0-9]{40}$/u.test(ref)));
});

test("release workflow publishes npm through trusted publishing before documentation", async () => {
  const workflow = await readFile(path.join(ROOT, ".github/workflows/publish-docs.yml"), "utf8");
  for (const phrase of [
    "id-token: write",
    "npm install -g npm@11",
    'npm view "@cavi-ai/antigravity@${PKG_VERSION}" version',
    "npm publish --access public --provenance",
  ]) {
    assert.ok(workflow.includes(phrase), phrase);
  }
  assert.ok(workflow.includes("registry-url: https://registry.npmjs.org"));
  assert.ok(
    workflow.indexOf("npm publish --access public --provenance") <
      workflow.indexOf("npm run docs:build --"),
  );
  assert.doesNotMatch(workflow, /(?:NPM_TOKEN|NODE_AUTH_TOKEN)/u);
});
