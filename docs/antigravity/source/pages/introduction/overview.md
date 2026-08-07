# Antigravity for OpenClaw

`@cavi-ai/antigravity` connects OpenClaw to Google's Antigravity CLI (`agy`) as
a subscription-backed model provider. The plugin id is `antigravity`; the model
provider and CLI backend id is `antigravity-cli`.

This is an external plugin. It is separate from OpenClaw's bundled
`google-antigravity` provider and from the unrelated unscoped npm package
`openclaw-antigravity`.

## Runtime boundary

OpenClaw owns the conversation presented to the plugin. `agy` owns inference and
authentication. Each turn runs `agy --print` with JSON output; follow-up turns
resume the `agy` conversation id. The plugin stores no API key and does not
replace the Antigravity CLI login flow.

Use models as `antigravity-cli/<model>`. The model id is handed to `agy`, which
is the source of truth for the models available to the signed-in account.
