# Troubleshooting

## The plugin is missing

Check the install path, the `plugins.entries.antigravity.enabled` flag, and that
the Gateway restarted after the change. Doctor can diagnose registered
provider state, but doctor cannot repair discovery when the plugin never loaded.

## `agy` is missing

Run `agy models` in the Gateway environment. If the shell finds a different
binary or no binary, set `plugins.entries.antigravity.config.command` to the
absolute path of the intended executable.

## Authentication fails

Follow the authentication recovery procedure: sign in through `agy`, verify
with `agy models`, and keep credentials out of OpenClaw configuration.

## A model is rejected before `agy` runs

Use `antigravity-cli/<model>` and check
`agents.defaults.modelPolicy.allow`. An allowlist must include the selected
model or `antigravity-cli/*`.

## A tool call waits for approval

Non-interactive print mode cannot answer prompts. Keep the default
`mode: accept-edits`, or choose `none` only when the intended `agy` permission
handling works for the deployment. Enable `skipPermissions` only after accepting
the security tradeoff.
