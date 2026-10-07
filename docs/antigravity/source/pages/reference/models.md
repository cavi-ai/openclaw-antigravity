# Models

Use `agy models` for the live catalog available to the current Antigravity
session. Reference the OpenClaw id as `antigravity-cli/<model>`. Effort
suffixes (`-high`, `-medium`, `-low`) on `agy models` rows are not part of
that id.

Discovery asks `agy models` and serves one catalog row per model. Reconnect
writes those rows into the provider config. The plugin also keeps a static fallback
snapshot and aliases such as `pro`, `flash`, `sonnet`, `opus`, and `gpt-oss`.
Aliases expand before the CLI run. A non-empty model id not yet present in the
static catalog is passed through to `agy --model` instead of being rejected by
the plugin. Claude Opus is the exception: `agy` only accepts
`claude-opus-4-6-thinking`.

Thinking is the OpenClaw thinking param, not part of the model id. It is
passed as `agy --effort`, limited to the levels `agy models` lists for the
model: `low`, `medium`, `high` for Gemini Flash; `low`, `high` for Gemini 3.1
Pro; `medium` for GPT-OSS. A level outside that snapshot is passed through
when the live `agy models` listing includes it. `agy` requires the flag on those models, so `off`
sends the lowest listed level. An unlisted level sends the nearest listed level, and a tie sends the lower one.
When no level is selected, the default is `medium` if that model lists it, otherwise the lowest listed level.
Claude models reject `--effort`, so the flag is omitted.

Catalog context-window values are conservative budgeting floors because the
CLI does not publish per-model limits through this plugin boundary. Reported
per-token cost stays zero unless the Google provider catalog has a positive
rate for that same model id. `agy models` does not supply a rate. A zero cost
is not a claim that the subscription itself is free.
