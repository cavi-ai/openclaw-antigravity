# Quickstart

1. Install and enable the plugin, then restart the Gateway.
2. Run `agy models` on the same host and as the same user that runs the Gateway.
3. Confirm the plugin list shows `antigravity` and provider setup shows
   `antigravity-cli`.
4. Send a text prompt with an OpenClaw model id. Effort suffixes from
   `agy models` are not part of that id:

```bash
openclaw agent --model antigravity-cli/gemini-3.1-pro -m "hello"
```

The general form is `antigravity-cli/<model>`. Reconnect saves the current
`agy models` list on the provider. It does not add those refs to
`agents.defaults.models` or to a model allow policy.

Print mode streams response text and native tool starts/results into OpenClaw.
The final result supplies the conversation id and token usage. A truncated
stream fails explicitly instead of being accepted as a completed response.
It accepts text prompts and does not add inline image support.

Antigravity automatically compacts its native conversation when needed. The
plugin leaves that history with `agy`; it does not run a second summarizer.
Manual OpenClaw `/compact` is unsupported, and the current AGY event format does
not expose dedicated compaction status events.
