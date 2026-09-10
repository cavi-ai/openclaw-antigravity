# Changelog

## 0.2.0

- Add provider-owned guided setup that validates the external `agy` session
  without storing an OpenClaw credential.
- Persist the provider connection on reconnect: guided and interactive reconnect
  preserve existing provider options and return a non-secret `configPatch`
  recording the Antigravity endpoint and model catalog.
- Refresh the static catalog for the models reported by `agy` 1.1.25.
- Accept model listings written to stdout or stderr and separated by tabs or
  spaces.
- Give Antigravity provider requests focused guidance for using the local
  `openclaw` CLI and MCP servers managed by `mcporter`, using a stable hook id.

## 0.1.0

- First public release under `@cavi-ai/antigravity` (the unscoped npm name
  `openclaw-antigravity` is a different package).
- OpenClaw provider/cli-backend ownership metadata, package-root setup entry,
  doctor contract, and CLI-owned auth recovery hints.
- Models via `antigravity-cli/<model>` using Google's Antigravity CLI (`agy`).
