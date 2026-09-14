import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { gunzipSync } from "node:zlib";

const IDENTITY = {
  version: "0.2.2",
  tag: "v0.2.2",
  commit: "0123456789abcdef0123456789abcdef01234567",
  sourceDateEpoch: 1700000000,
};

function tarEntries(archive) {
  const tar = gunzipSync(archive);
  const entries = [];
  for (let offset = 0; offset + 512 <= tar.length;) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every((byte) => byte === 0)) break;
    const value = (start, length) => header.subarray(start, start + length).toString().replace(/\0.*$/u, "");
    const name = value(0, 100);
    const prefix = value(345, 155);
    const size = Number.parseInt(value(124, 12).trim() || "0", 8);
    entries.push({ name: prefix ? `${prefix}/${name}` : name, type: value(156, 1) || "0" });
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  return entries;
}

test("release artifact, checksum, exact envelope, and member bounds are deterministic", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "antigravity-docs-release-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const { buildDocumentation } = await import("./build.mjs");
  const { createProductDocsReleaseArtifact } = await import("./release-artifact.mjs");
  const docsRoot = path.join(temporary, "docs");
  await buildDocumentation({ ...IDENTITY, outputRoot: docsRoot });
  const results = [];
  for (const name of ["one", "two"]) {
    results.push(await createProductDocsReleaseArtifact({
      ...IDENTITY,
      docsRoot,
      outputDirectory: path.join(temporary, name),
      repository: "cavi-ai/openclaw-antigravity",
    }));
  }
  const firstBytes = await readFile(results[0].artifactPath);
  assert.deepEqual(firstBytes, await readFile(results[1].artifactPath));
  const sha256 = createHash("sha256").update(firstBytes).digest("hex");
  assert.deepEqual(results[0].envelope, {
    schemaVersion: 1,
    slug: "antigravity",
    kind: "product-docs",
    version: "0.2.2",
    tag: "v0.2.2",
    repository: "cavi-ai/openclaw-antigravity",
    commit: IDENTITY.commit,
    artifact: {
      url: "https://github.com/cavi-ai/openclaw-antigravity/releases/download/v0.2.2/antigravity-docs-v0.2.2.tar.gz",
      sha256,
      format: "tar.gz",
    },
  });
  assert.equal(
    await readFile(results[0].checksumPath, "utf8"),
    `${sha256}  antigravity-docs-v0.2.2.tar.gz\n`,
  );
  const entries = tarEntries(firstBytes);
  assert.ok(entries.some((entry) => entry.name === "cavi-release.json"));
  assert.ok(entries.every((entry) => entry.type === "0"));
  assert.ok(entries.every(({ name }) => (
    name === "cavi-release.json" || name.startsWith("docs/antigravity/v0.2.2/")
  )));
  assert.ok(entries.every(({ name }) => !name.startsWith("/") && !name.split("/").includes("..")));
});

test("release artifact rejects documentation built for another commit", async (context) => {
  const temporary = await mkdtemp(path.join(os.tmpdir(), "antigravity-docs-provenance-"));
  context.after(() => rm(temporary, { recursive: true, force: true }));
  const { buildDocumentation } = await import("./build.mjs");
  const { createProductDocsReleaseArtifact } = await import("./release-artifact.mjs");
  const docsRoot = path.join(temporary, "docs");
  await buildDocumentation({ ...IDENTITY, outputRoot: docsRoot });
  await assert.rejects(createProductDocsReleaseArtifact({
    ...IDENTITY,
    commit: "a".repeat(40),
    docsRoot,
    outputDirectory: path.join(temporary, "release"),
    repository: "cavi-ai/openclaw-antigravity",
  }), /manifest is inconsistent/u);
});
