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

- OpenClaw 2026.7 or newer
- Node.js 20 or newer
- Antigravity CLI installed and signed in

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

In OpenClaw, select **Antigravity CLI** and choose **Reconnect**. The plugin validates the existing `agy` session and makes its models available without creating a separate credential.

## Use

Models use the `antigravity-cli/<model>` format:

```bash
openclaw agent --model antigravity-cli/gemini-3.1-pro-high -m "hello"
```

If your OpenClaw configuration uses `agents.defaults.modelPolicy.allow`, add the models you want to use or allow `antigravity-cli/*`.

### Models

Run `agy models` for the live list. The plugin includes this catalog from `agy` 1.1.25:

| Model | Alias |
| --- | --- |
| `gemini-3.8-flash-high` | |
| `gemini-3.8-flash-medium` | |
| `gemini-3.8-flash-low` | |
| `gemini-3.7-flash-high` | |
| `gemini-3.7-flash-medium` | |
| `gemini-3.7-flash-low` | |
| `gemini-3.6-flash-high` | |
| `gemini-3.6-flash-medium` | `flash` |
| `gemini-3.6-flash-low` | `flash-lite` |
| `gemini-3.1-pro-high` | `pro` (default) |
| `gemini-3.1-pro-low` | |
| `claude-sonnet-4-6` | `sonnet` |
| `claude-opus-4-6-thinking` | `opus` |
| `gpt-oss-120b-medium` | `gpt-oss` |

New model IDs that are not yet in the catalog are passed through to `agy`.

## OpenClaw and MCP commands

When a request runs through this provider, Antigravity is told to:

- use the installed `openclaw` CLI for OpenClaw operations;
- use `mcporter` for external MCP servers it manages; and
- check each CLI's help before assuming command syntax.

This guidance is limited to Antigravity requests and does not change either tool's global configuration.

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
- If OpenClaw rejects a model before it runs, check `agents.defaults.modelPolicy.allow`.

## Limitations

- Responses are returned after `agy` finishes; token streaming is not available.
- Inline image input is not supported by `agy --print`.
- Per-token cost is reported as zero because Antigravity is subscription-backed.
- Context-window values are conservative because the CLI does not publish per-model limits.

## Development

```bash
npm test          # plugin behaviour
npm run docs:test # documentation build/verify/release tooling
```

Releasing docs is automated: publish a GitHub Release `vX.Y.Z` (matching
`package.json`) and the `Publish release documentation` workflow builds the
versioned artifact, attaches it to the release, and dispatches cavi-home to
ingest it. See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
