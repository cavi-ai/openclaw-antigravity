# Contributing to @cavi-ai/antigravity

Thank you for contributing. Keep changes focused, tested, and free of private
data.

## Development setup

Requires Node.js 20 or newer. The plugin has no runtime dependencies.

```sh
npm test
```

## Pull requests

- Base work on the current `main` branch.
- Add or update tests before changing behavior.
- Keep commits focused and use factual commit and pull-request descriptions.
- Update `README.md` and `CHANGELOG.md` when behavior changes.
- Do not commit local plans, transcripts, credentials, `agy` CLI session data,
  machine-specific paths, or other private artifacts.

Before opening a pull request, run:

```sh
npm test
npm run docs:test
git diff --check
```

## Documentation

Product documentation source lives under `docs/antigravity/source/`. Every
section and page carries a title; `navigation.json` also declares the product
version so built snapshots match their release manifest. Verify the docs
contracts with:

```sh
npm run docs:test
```

## Releasing documentation

Documentation is released with the package, not by hand:

1. Bump `version` in `package.json` and update `CHANGELOG.md`.
2. Publish a GitHub Release tagged `vX.Y.Z` that matches that version.
3. The `Publish release documentation` workflow builds the versioned artifact
   from `docs/antigravity/source/`, verifies it against `package.json`, attaches
   `antigravity-docs-vX.Y.Z.tar.gz` (with its `.sha256`) to the release, and
   dispatches `cavi-ai/cavi-home` to ingest it.
4. cavi-home serves the ingested version at `cavi-ai.xyz/docs/antigravity`.

The release tag must equal `v` + the `package.json` version or the workflow
fails before uploading anything. Run a `workflow_dispatch` with `dry_run: true`
to build and verify the artifact without touching the release or cavi-home.
