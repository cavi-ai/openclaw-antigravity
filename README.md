# openclaw-antigravity

An [OpenClaw](https://github.com/openclaw/openclaw) plugin that runs Google's
Antigravity CLI (`agy`) as a model provider.

Google is [retiring Gemini CLI in favour of Antigravity CLI][transition]. OpenClaw
ships a `google-gemini-cli` provider; this plugin fills the same slot with `agy`,
so a Google subscription keeps working after that migration.

Inference and authentication stay inside `agy`. The plugin stores no API key: it
drives `agy --print` and reads the JSON result, the same shape as OpenClaw's other
CLI backends.

[transition]: https://developers.googleblog.com/an-important-update-transitioning-gemini-cli-to-antigravity-cli/

## Requirements

- OpenClaw `2026.7` or newer
- Node.js 20+
- Antigravity CLI on `PATH`, already signed in — check with `agy models`

## Install

```bash
openclaw plugins install openclaw-antigravity
```

Then enable it:

```bash
openclaw config set plugins.entries.antigravity.enabled true
```

If your `plugins` config is stored through a `$include`, edit the included file
directly — `openclaw plugins install` refuses to write through that shape.

## Use

Models are referenced as `antigravity-cli/<model>`:

```bash
openclaw agent --model antigravity-cli/gemini-3.1-pro-high -m "hello"
```

If `agents.defaults.modelPolicy.allow` is set, add the models you intend to use
(or `antigravity-cli/*`) — an allowlist that omits them rejects the model ref
before the backend runs.

### Models

`agy` serves several vendors behind one subscription. Run `agy models` for the
live list; as of `agy` 1.1.9 the plugin ships this catalog:

| Model | Alias |
| --- | --- |
| `gemini-3.6-flash-high` | |
| `gemini-3.6-flash-medium` | `flash` |
| `gemini-3.6-flash-low` | `flash-lite` |
| `gemini-3.5-flash-high` | |
| `gemini-3.5-flash-medium` | |
| `gemini-3.5-flash-low` | |
| `gemini-3.1-pro-high` | `pro` (default) |
| `gemini-3.1-pro-low` | |
| `claude-sonnet-4-6` | `sonnet` |
| `claude-opus-4-6-thinking` | `opus` |
| `gpt-oss-120b-medium` | `gpt-oss` |

Model ids the catalog has not caught up with are passed straight through to
`agy --model`, so a newly released model is usable before it is listed here.

## Configuration

All keys live under `plugins.entries.antigravity.config` and are optional.

| Key | Default | Purpose |
| --- | --- | --- |
| `command` | `agy` | Path to the `agy` binary when it is not on `PATH`. |
| `mode` | `accept-edits` | Value for `agy --mode`, or `none` to omit the flag. |
| `skipPermissions` | `false` | Pass `--dangerously-skip-permissions`. |

`mode` defaults to `accept-edits` because `agy --print` cannot prompt a human:
under the default review mode, tool calls wait for an approval that never
arrives. Set `mode` to `none` to hand permission handling back to `agy`.

## How it works

OpenClaw owns the conversation; `agy` owns inference and auth.

- Each turn runs `agy --print <prompt> --output-format json`.
- The reply is read from the result's `response` field.
- Follow-up turns resume with `--conversation <conversation_id>`, so multi-turn
  context lives in `agy`'s own conversation store.
- Runs are serialized: concurrent print-mode turns against one conversation
  interleave writes to its history.

`agy`'s `--output-format stream-json` is a third dialect — `init` / `step_update`
/ `result` events — matching neither `claude-stream-json` nor
`gemini-stream-json`. Consuming it would need a new dialect in OpenClaw core, so
this plugin uses `--output-format json` and stays core-compatible.

## Limitations

- **No streaming.** Print mode returns one JSON object per turn, so replies
  arrive whole rather than token by token.
- **No images.** `agy --print` accepts no inline media.
- **Reported cost is zero.** Antigravity bills by subscription, not per token, so
  the catalog reports no per-token price rather than inventing one.
- **Context windows are conservative floors.** Antigravity publishes no
  per-model limits for the CLI; the values in `src/models.js` exist so OpenClaw
  budgets sanely and can be raised if `agy` is observed accepting more.

## Development

```bash
npm test
```

## License

MIT
