# Changelog

## 0.2.8

- Publish one catalog id per model. `agy` effort suffixes are not part of the
  OpenClaw model id; thinking level stays on `agy --effort`. Claude omits
  `--effort`. Opus is sent to `agy` as `claude-opus-4-6-thinking`.

## 0.2.7

- Keep `antigravity-cli` selectable in `openclaw configure` and load its catalog
  after the auth choice.

## 0.2.6

- Refresh the Antigravity model catalog from live `agy models`. Reconnect
  records the endpoint and does not write model rows into config.
- Treat thinking as the OpenClaw thinking param. `off` omits `agy --effort`;
  `low`, `medium`, and `high` set it. Model ids are unchanged.

## 0.2.5

- Resolve `agy` from `~/.local/bin` when the Gateway service PATH does not
  include it, so Reconnect and CLI inference work from launchd/systemd instead
  of reporting a false "sign in" failure.

## 0.2.4

- Make the guided-discovery **Reconnect** verification tool-free by installing
  a bundled, isolated `agy` custom agent for setup probes. Normal provider
  turns retain the configured Antigravity mode and tool behavior.
- Declare the native `agy` executable as the CLI backend runtime artifact so
  current OpenClaw hosts can bind the setup probe to a durable owner.
- Extend the installed-host integration check through Reconnect activation and
  isolate its temporary `agy` plugin config from the user's existing plugins.
- Require Antigravity CLI 1.2.1 or newer for hard tool-free setup probes.

## 0.2.3

- Use OpenClaw's provider-owned guided discovery for Control UI reconnect, the
  same local-CLI path as Ollama and LM Studio. Models → Providers shows
  **Reconnect** and persists the non-secret connection without an OpenClaw
  credential. This replaces the 0.2.2 credential-only Connect routing, which
  is not a host contract for profileless CLI sessions.

## 0.2.2

- Route Control UI login through the credential-only provider connection flow.
  This avoids inference-gated setup, which cannot safely use `agy` because the
  CLI does not expose a hard tool-free mode.

## 0.2.1

- Register `before_prompt_build` with `api.on` so the plugin loads on current
  OpenClaw hosts. `0.2.0` called `registerHook` without a name and aborted
  registration with `hook registration missing name`.

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
