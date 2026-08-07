# Trust boundary

OpenClaw owns orchestration and passes a text prompt to the registered CLI
backend. `agy` owns inference and authentication, keeps its own conversation
state, and returns JSON to the plugin. The plugin stores no API key.

Each turn creates an `agy --print` subprocess. The configured `command` is an
executable path, not a shell command; use an absolute path and avoid shell
metacharacters. Runs are serialized so two turns do not interleave writes to
one `agy` conversation.

The plugin does not add network isolation or a separate tool sandbox around
`agy`. The `mode` and `skipPermissions` settings affect what the CLI may do.
`skipPermissions` is off by default because
`--dangerously-skip-permissions` removes normal permission prompts.

Treat the Gateway OS account and its `agy` login state as part of the same
security boundary. Restrict access to that account and review the CLI's own
permissions before enabling unattended runs.
