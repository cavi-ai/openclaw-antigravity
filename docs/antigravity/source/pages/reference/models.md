# Models

Use `agy models` for the live catalog available to the current Antigravity
session. Reference the OpenClaw id as `antigravity-cli/<model>`. Effort
suffixes (`-high`, `-medium`, `-low`) on `agy models` rows are not part of
that id.

Discovery asks `agy models` and serves one catalog row per model. Reconnect
does not write model rows into config. The plugin also keeps a static fallback
snapshot and aliases such as `pro`, `flash`, `sonnet`, `opus`, and `gpt-oss`.
Aliases expand before the CLI run. A non-empty model id not yet present in the
static catalog is passed through to `agy --model` instead of being rejected by
the plugin. Claude Opus is the exception: `agy` only accepts
`claude-opus-4-6-thinking`.

Thinking is the OpenClaw thinking param, not part of the model id. For Gemini
and GPT-OSS, `low`, `medium`, and `high` are passed as `agy --effort`. `off`
omits the flag. Claude models reject `--effort`, so the flag is omitted.

Catalog context-window values are conservative budgeting floors because the
CLI does not publish per-model limits through this plugin boundary. Reported
per-token cost is zero because the backend uses a subscription rather than an
API token-billing contract; it is not a claim that the subscription itself is
free.
