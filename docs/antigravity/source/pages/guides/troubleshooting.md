# Troubleshooting

## The plugin is missing

Check the install path, the `plugins.entries.antigravity.enabled` flag, and that
the Gateway restarted after the change. Doctor can diagnose registered
provider state, but doctor cannot repair discovery when the plugin never loaded.

## `hook registration missing name`

`0.2.0` failed during plugin register on OpenClaw hosts that require a named
legacy hook or typed `api.on("before_prompt_build")`. Install `0.2.1` or later
and restart the Gateway.

## `agy` is missing

Run `agy models` in the Gateway environment. If the shell finds a different
binary or no binary, set `plugins.entries.antigravity.config.command` to the
absolute path of the intended executable.

## Reconnect reports that hard tool-free mode is unavailable

Install `agy` 1.2.1 or newer. Reconnect uses a bundled custom agent with
built-in components excluded so OpenClaw can run its connection probe without
tools.

## Authentication fails

Follow the authentication recovery procedure: sign in through `agy`, verify
with `agy models`, and keep credentials out of OpenClaw configuration.

## A model is rejected before `agy` runs

Use `antigravity-cli/<model>` and check
`agents.defaults.modelPolicy.allow`. An allowlist must include the selected
model or `antigravity-cli/*`. After `agy` adds or removes models, discovery
reads the new ids; the allowlist still has to include them.

## A tool call waits for approval

Non-interactive print mode cannot answer prompts. Keep the default
`mode: accept-edits`, or choose `none` only when the intended `agy` permission
handling works for the deployment. Enable `skipPermissions` only after accepting
the security tradeoff.
