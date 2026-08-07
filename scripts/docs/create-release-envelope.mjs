import { PRODUCT_ID, RELEASE_REPOSITORY, parseOptions } from "./lib.mjs";

const VERSION = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const COMMIT = /^[a-f0-9]{40}$/u;
const SHA256 = /^[a-f0-9]{64}$/u;

export function createReleaseEnvelope(input) {
  if (!VERSION.test(input.version ?? "")) throw new Error("version must be an exact stable semantic version");
  if (input.tag !== `v${input.version}`) throw new Error("release tag must match version");
  if (input.repository !== RELEASE_REPOSITORY) {
    throw new Error(`release repository must be ${RELEASE_REPOSITORY}`);
  }
  if (!COMMIT.test(input.commit ?? "")) throw new Error("release commit must be a lowercase 40-character SHA");
  if (!SHA256.test(input.artifactSha256 ?? "")) {
    throw new Error("artifact SHA-256 must be 64 lowercase hexadecimal characters");
  }
  const artifactName = `${PRODUCT_ID}-docs-${input.tag}.tar.gz`;
  return {
    schemaVersion: 1,
    slug: PRODUCT_ID,
    kind: "product-docs",
    version: input.version,
    tag: input.tag,
    repository: input.repository,
    commit: input.commit,
    artifact: {
      url: `https://github.com/${input.repository}/releases/download/${input.tag}/${artifactName}`,
      sha256: input.artifactSha256,
      format: "tar.gz",
    },
  };
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  try {
    const values = parseOptions(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(createReleaseEnvelope({
      version: values.version,
      tag: values.tag,
      repository: values.repository,
      commit: values.commit,
      artifactSha256: values["artifact-sha256"],
    }))}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  }
}
