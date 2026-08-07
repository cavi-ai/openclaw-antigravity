# Configuration

All settings are optional and live under
`plugins.entries.antigravity.config`.

| Key | Default | Effect |
| --- | --- | --- |
| `command` | `agy` | Executable used for Antigravity CLI runs. Prefer an absolute path and do not include shell metacharacters. |
| `mode` | `accept-edits` | Value passed to `agy --mode`; set `none` to omit the flag. |
| `skipPermissions` | `false` | Adds `--dangerously-skip-permissions` only when explicitly enabled. |

`accept-edits` is the default because non-interactive `agy --print` cannot
answer a permission prompt. `plan` keeps the CLI in plan mode. `none` delegates
permission behavior to `agy` by omitting the mode argument.

Enabling `skipPermissions` changes the trust boundary: `agy` may run tools
without its normal permission prompts. Leave it off unless the Gateway operator
accepts that behavior.
