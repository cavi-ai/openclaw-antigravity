import { readFile, stat } from "node:fs/promises";
import path from "node:path";

import {
  NPM_PACKAGE_NAME,
  OUTPUT_REL,
  PRODUCT_ID,
  REPO_ROOT,
  UNRESOLVED_TOKEN,
  computeContentSha256,
  listFilesRecursive,
  navigationPaths,
  parseOptions,
  releaseInput,
  resolveReleaseIdentity,
} from "./lib.mjs";

export async function verifyDocumentation(input = {}) {
  const release = resolveReleaseIdentity(input);
  const root = path.resolve(input.docsRoot ?? input.outputRoot ?? path.join(REPO_ROOT, OUTPUT_REL));
  const paths = await listFilesRecursive(root);
  const manifest = JSON.parse(await readFile(path.join(root, "manifest.json"), "utf8"));
  const expected = {
    schemaVersion: 2,
    package: NPM_PACKAGE_NAME,
    product: PRODUCT_ID,
    version: release.version,
    contentSha256: await computeContentSha256(root, paths),
    publicBasePath: `/docs/${PRODUCT_ID}/v${release.version}`,
    stableAlias: `/docs/${PRODUCT_ID}`,
    release: { tag: release.tag, commit: release.commit },
    generatedAt: release.generatedAt,
  };
  if (JSON.stringify(manifest) !== JSON.stringify(expected)) {
    throw new Error("documentation manifest is inconsistent with built content");
  }
  const navigation = JSON.parse(await readFile(path.join(root, "navigation.json"), "utf8"));
  for (const page of navigationPaths(navigation)) {
    if (!(await stat(path.join(root, page))).isFile()) throw new Error(`navigation path is not a file: ${page}`);
  }
  for (const relative of paths) {
    if (UNRESOLVED_TOKEN.test(await readFile(path.join(root, relative), "utf8"))) {
      throw new Error(`unresolved template token in ${relative}`);
    }
  }
  return manifest;
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const values = parseOptions(process.argv.slice(2));
  verifyDocumentation({
    ...releaseInput(values),
    ...(values.output ? { outputRoot: path.resolve(values.output) } : {}),
  }).then((manifest) => process.stdout.write(`${JSON.stringify(manifest)}\n`)).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
