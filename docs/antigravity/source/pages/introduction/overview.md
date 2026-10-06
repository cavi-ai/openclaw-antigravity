# Antigravity for OpenClaw

`@cavi-ai/antigravity` connects OpenClaw to Google's Antigravity CLI (`agy`) as
a subscription-backed model provider. The plugin id is `antigravity`; the model
provider and CLI backend id is `antigravity-cli`.

This is an external plugin. It is separate from OpenClaw's bundled
`google-antigravity` provider and from the unrelated unscoped npm package
`openclaw-antigravity`.

## Runtime boundary

OpenClaw owns the conversation presented to the plugin. `agy` owns inference,
authentication, native tools, and automatic compaction. Each turn runs
`agy --print --output-format stream-json`; follow-up turns
resume the `agy` conversation id. The plugin stores no API key and does not
replace the Antigravity CLI login flow.

OpenClaw displays incremental response text and native tool starts/results.
Tool events report actions already performed by `agy`. They do not execute
OpenClaw tools or establish OpenClaw message-delivery evidence.

Use models as `antigravity-cli/<model>`. `agy models` is the source of truth
for which models the signed-in account can run. Effort suffixes on those rows
are not part of the OpenClaw model id. Discovery refreshes the catalog from
`agy models`. Reconnect writes those rows into the provider config. Thinking level
is passed as `agy --effort`, limited to the levels `agy models` lists for the
model. Claude omits that flag.
Opus is sent to `agy` as `claude-opus-4-6-thinking`.
