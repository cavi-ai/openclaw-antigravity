# Models

Use `agy models` for the live catalog available to the current Antigravity
session. Reference a returned id as `antigravity-cli/<model>`.

The plugin includes a static catalog for known models and aliases such as
`pro`, `flash`, `sonnet`, `opus`, and `gpt-oss`. Aliases expand before the CLI
run. A non-empty model id not yet present in the static catalog is passed
through to `agy --model` instead of being rejected by the plugin.

Catalog context-window values are conservative budgeting floors because the
CLI does not publish per-model limits through this plugin boundary. Reported
per-token cost is zero because the backend uses a subscription rather than an
API token-billing contract; it is not a claim that the subscription itself is
free.
