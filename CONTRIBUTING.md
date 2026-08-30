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
