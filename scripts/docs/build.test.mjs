import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const IDENTITY = {
  version: "0.2.3",
  tag: "v0.2.3",
  commit: "0123456789abcdef0123456789abcdef01234567",
  sourceDateEpoch: 1700000000,
};

async function files(root, current = root) {
  const output = [];
  for (const entry of await readdir(current, { withFileTypes: true })) {
    const absolute = path.join(current, entry.name);
    if (entry.isDirectory()) output.push(...await files(root, absolute));
    else output.push(path.relative(root, absolute).split(path.sep).join("/"));
  }
  return output.sort();
}

async function digest(root, excludeManifest = false) {
  const hash = createHash("sha256");
  for (const relative of await files(root)) {
    if (excludeManifest && relative === "manifest.json") continue;
    hash.update(relative);
    hash.update("\0");
    hash.update(await readFile(path.join(root, relative)));
    hash.update("\0");
  }
  return hash.digest("hex");
}

test("build output is complete, stamped, and byte reproducible", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "antigravity-docs-build-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const { buildDocumentation } = await import("./build.mjs");
  const { verifyDocumentation } = await import("./verify.mjs");
  const first = path.join(temporary, "first");
  const second = path.join(temporary, "second");
  await buildDocumentation({ ...IDENTITY, outputRoot: first });
  await buildDocumentation({ ...IDENTITY, outputRoot: second });
  assert.equal(await digest(first), await digest(second));
  const manifest = JSON.parse(await readFile(path.join(first, "manifest.json"), "utf8"));
  assert.deepEqual(manifest, {
    schemaVersion: 2,
    package: "@cavi-ai/antigravity",
    product: "antigravity",
    version: "0.2.3",
    contentSha256: await digest(first, true),
    publicBasePath: "/docs/antigravity/v0.2.3",
    stableAlias: "/docs/antigravity",
    release: { tag: "v0.2.3", commit: IDENTITY.commit },
    generatedAt: "2023-11-14T22:13:20.000Z",
  });
  await verifyDocumentation({ ...IDENTITY, docsRoot: first });
  for (const relative of await files(first)) {
    assert.doesNotMatch(await readFile(path.join(first, relative), "utf8"), /\{\{[A-Z][A-Z0-9_]*\}\}/u);
  }
});

test("build and verification reject inconsistent identity or changed output", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "antigravity-docs-dirty-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const { buildDocumentation } = await import("./build.mjs");
  const { verifyDocumentation } = await import("./verify.mjs");
  await assert.rejects(
    buildDocumentation({ ...IDENTITY, version: "0.1.1", outputRoot: temporary }),
    /release version must be 0\.2\.3/u,
  );
  const output = path.join(temporary, "built");
  await buildDocumentation({ ...IDENTITY, outputRoot: output });
  await writeFile(path.join(output, "navigation.json"), "dirty\n");
  await assert.rejects(buildDocumentation({ ...IDENTITY, outputRoot: output }), /dirty output/u);
  await assert.rejects(verifyDocumentation({ ...IDENTITY, docsRoot: output }), /inconsistent/u);
});
