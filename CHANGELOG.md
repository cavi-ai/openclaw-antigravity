# Changelog

## 0.3.0

- Serve the model catalog from live `agy models`, one OpenClaw id per model.
  Effort suffixes are no longer part of the id (`gemini-3.1-pro-high` is now
  `gemini-3.1-pro`); suffixed refs still resolve. Reconnect records the
  endpoint and does not write model rows into config.
- Aliases target the new ids: `pro` → `gemini-3.1-pro`, `flash` and
  `flash-lite` → `gemini-3.8-flash`, `opus` → `claude-opus-4-6`, `gpt-oss` →
  `gpt-oss-120b`. Opus is sent to `agy` as `claude-opus-4-6-thinking`.
- Pass the OpenClaw thinking level as `agy --effort`, limited to the levels
  `agy models` lists for the model. `off` sends the lowest listed level where
  `agy` requires the flag; an unlisted level sends the nearest one. Claude
  omits `--effort`. The thinking profile offers only those levels per model.
- Send `--effort` on the Reconnect setup probe and other side questions;
  `agy` rejects Gemini runs without it.
- Reconnect writes `models: []` for the provider so OpenClaw config validation
  accepts the connection. Catalog rows still come from `agy models`.
- Document the `hooks.allowConversationAccess` grant OpenClaw requires before
  it runs the provider guidance hook.
- Keep `antigravity-cli` selectable in `openclaw configure` and load its
  catalog after the auth choice.
- Resolve `agy` from `~/.local/bin` when the Gateway service PATH omits it.
- Label Claude models with dotted versions (`Claude Sonnet 4.6`).

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
