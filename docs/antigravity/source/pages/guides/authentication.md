# Authentication

The plugin does not create or store Antigravity credentials. `agy` owns the
login session, so sign in through `agy` and confirm the session with:

```bash
agy models
```

OpenClaw registers a local CLI connection through guided discovery, the same
path as Ollama and LM Studio. In the Control UI, open **Models → Providers**
and choose **Reconnect** on the Antigravity CLI card. The action validates the
`agy` session, writes the `agy models` rows onto the provider, and records
a non-secret session marker so the card can show the session. It does
not copy the Antigravity access token, refresh token, or access-token expiry,
and it does not change the default model. The provider exposes no credential environment variables.
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
