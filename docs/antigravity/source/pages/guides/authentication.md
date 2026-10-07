# Authentication

The plugin does not create or store Antigravity credentials. `agy` owns the
login session, so sign in through `agy` and confirm the session with:

```bash
agy models
```

OpenClaw asks `agy` whether that login is usable, the same way it asks
Claude CLI and Codex about their own sessions. In the Control UI, open
**Models → Providers** and choose **Reconnect** on the Antigravity CLI card.
The action checks `agy models` and writes those model rows onto the provider.
It does not write an API key, and it does not copy the Antigravity access
token, refresh token, or access-token expiry. It does not change the default
model. The provider exposes no credential environment variables. A stored
`agy-session` value on `models.providers.antigravity-cli.apiKey` is leftover
and should be removed; `openclaw doctor --fix` deletes that marker, the
native-auth marker, and auth profiles prefixed `antigravity-cli:`,
`antigravity:`, or `agy:`. A different `apiKey` string is left unchanged.
Reconnect installs or refreshes the bundled `openclaw-antigravity-tool-free` custom
agent. OpenClaw uses that isolated agent only for its connection probe; normal
provider turns keep the configured `agy` mode and tool behavior.

Complete first-run setup with another inference provider when possible, then
reconnect Antigravity from **Models → Providers**. Models-page reconnect
refreshes the connection without replacing the default model.

## Recovery

If a previously working session stops authenticating:

1. Run `agy models` as the Gateway user.
2. If that command reports an expired or missing session, complete the login
   flow in `agy`; do not paste an API key into OpenClaw for this provider.
3. Run `agy models` again before retrying OpenClaw.
4. In the Control UI, open **Models → Providers** and choose **Reconnect** on
   the Antigravity CLI card.
5. If the command works interactively but not in the Gateway, configure an
   absolute `command` path and verify both processes use the same OS account and
   environment.
