# @cavi-ai/antigravity

Use Google's Antigravity CLI (`agy`) as an [OpenClaw](https://github.com/openclaw/openclaw) model provider.

The plugin uses the Antigravity login already available to `agy`. It does not ask for or store an Antigravity API key.

**Documentation:** [Online docs](https://cavi-ai.xyz/docs/antigravity) ·
[Overview](docs/antigravity/source/pages/introduction/overview.md) ·
[Quickstart](docs/antigravity/source/pages/introduction/quickstart.md) ·
[Configuration](docs/antigravity/source/pages/guides/configuration.md) ·
[Contributing](CONTRIBUTING.md)

The pages under `docs/antigravity/source/` are the release source. A published
GitHub Release builds them into an immutable versioned artifact that cavi-home
ingests and serves at [cavi-ai.xyz/docs/antigravity](https://cavi-ai.xyz/docs/antigravity).

## Requirements

- OpenClaw 2026.9.6 or newer
- Node.js 24.16 or newer, or Node.js 26.1 or newer
- Antigravity CLI 1.2.1 or newer, installed and signed in

Confirm that Antigravity is ready:

```bash
agy models
```

## Install

```bash
openclaw plugins install @cavi-ai/antigravity
openclaw config set plugins.entries.antigravity.enabled true
```

Restart the OpenClaw Gateway after installation.

## Connect

In the Control UI, open **Models → Providers** and choose **Reconnect** on the
Antigravity CLI card. The plugin asks `agy` whether its login is usable and
writes the `agy models` rows onto the provider. The login stays in `agy`. The
plugin does not write an API key, and it does not copy the Antigravity access
token, refresh token, or access-token expiry. It does not change the default
model.
Reconnect installs
or refreshes the bundled `openclaw-antigravity-tool-free` custom agent, which
OpenClaw uses only for its connection probe. Normal provider turns keep the
configured `agy` mode and tool behavior.

Thinking level is a separate param and is passed as `agy --effort`, limited
to the levels `agy models` lists for that model: `low`/`medium`/`high` for
Gemini Flash, `low`/`high` for Gemini 3.1 Pro, `medium` for GPT-OSS. `agy`
requires the flag on those models, so `off` sends the lowest listed level and
an unlisted level sends the nearest one. Claude models reject `--effort`, so
the flag is omitted for them.

## Use

Models use the `antigravity-cli/<model>` format:

```bash
openclaw agent --model antigravity-cli/gemini-3.1-pro -m "hello"
```

### Models

Run `agy models` for the live list. Effort suffixes on those rows are not
model ids. The static fallback snapshot is:

| Model | Alias |
| --- | --- |
| `gemini-3.8-flash` | `flash`, `flash-lite` |
| `gemini-3.7-flash` | |
| `gemini-3.6-flash` | |
| `gemini-3.1-pro` | `pro` (default) |
| `claude-sonnet-4-6` | `sonnet` |
| `claude-opus-4-6` | `opus` |
| `gpt-oss-120b` | `gpt-oss` |

New model IDs that are not yet in the catalog are passed through to `agy`.

## OpenClaw and MCP commands

When a request runs through this provider, Antigravity is told to:

- use the installed `openclaw` CLI for OpenClaw operations;
- use `mcporter` for external MCP servers it manages; and
- check each CLI's help before assuming command syntax.

This guidance is the provider system-prompt contribution for `antigravity-cli`. Stock OpenClaw applies it with the provider. It does not use a conversation hook, and it does not change either tool's global configuration.

## Configuration

All settings are optional and live under `plugins.entries.antigravity.config`.

| Key | Default | Purpose |
| --- | --- | --- |
| `command` | `agy` | Path to the `agy` executable. |
| `mode` | `accept-edits` | Value passed to `agy --mode`, or `none` to omit it. |
| `skipPermissions` | `false` | Pass `--dangerously-skip-permissions`. Enable only if you accept tool runs without permission prompts. |

Example:

```bash
openclaw config set plugins.entries.antigravity.config.command /absolute/path/to/agy
```

## Troubleshooting

- Run `agy models` to confirm that the CLI is installed and signed in.
- If the provider is missing, confirm the plugin is enabled and restart the Gateway.
- If a model is missing after sign-in, reconnect so the current `agy models` list is saved with the provider.

## Limitations

- Responses stream incrementally, with native tool starts and results displayed
  by OpenClaw. These events describe tools run by `agy`; OpenClaw does not execute
  them again. Interrupted streams without a terminal result fail explicitly.
- `agy` owns automatic compaction of its resumable conversation. Manual
  OpenClaw `/compact` is unsupported for this backend. AGY's current stream does
  not expose dedicated compaction status events.
- Inline image input is not supported by `agy --print`.
- Per-token cost stays zero unless the Google provider has a positive rate for the same model id. `agy models` does not supply a rate.
- Context-window values are conservative because the CLI does not publish per-model limits.

## Development

```bash
npm test          # plugin behaviour
npm run docs:test # documentation build/verify/release tooling
npm run check:host-integration # live agy + isolated installed-host Reconnect check
npm run check:stream-integration # live text/tool events and a resumed turn
```

The host-integration check requires a signed-in `agy` session and a compatible
installed `openclaw` command. It runs `agy models`, starts the working-tree
plugin in a temporary loopback-only OpenClaw state, activates the projected
**Reconnect** action, and verifies that credential-only **Connect** is absent.
The check links the live `agy` session into a temporary home while keeping its
plugin configuration isolated. Both integration checks exclude unrelated bundled
plugins. The temporary gateway, home, and state are
removed afterward; the installed gateway, OpenClaw config, credentials,
default model, and pre-existing `agy` plugins are not changed. Set `AGY_BIN` or
`OPENCLAW_BIN` to use a non-default executable.

The streaming check reads a disposable fixture under the isolated agent workspace,
checks Gateway text deltas and correlated tool events, and sends a follow-up
turn to check conversation continuity. It uses normal AGY permissions.

Releasing docs is automated: publish a GitHub Release `vX.Y.Z` (matching
`package.json`) and the `Publish release documentation` workflow publishes the
npm package and the ClawHub plugin, builds the versioned artifact, attaches it
to the release, and dispatches cavi-home to ingest it. See
[CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
