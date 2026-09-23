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

The general form is `antigravity-cli/<model>`. If
`agents.defaults.modelPolicy.allow` is configured, add each intended model or
`antigravity-cli/*`; otherwise OpenClaw can reject the model reference before
the CLI backend runs.

Print mode returns the completed JSON response rather than token streaming. It
accepts text prompts and does not add inline image support.
