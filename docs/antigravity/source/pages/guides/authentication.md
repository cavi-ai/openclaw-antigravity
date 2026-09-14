# Authentication

The plugin does not create or store Antigravity credentials. `agy` owns the
login session, so sign in through `agy` and confirm the session with:

```bash
agy models
```

OpenClaw registers a local CLI connection through guided discovery, the same
path as Ollama and LM Studio. In the Control UI, open **Models → Providers**
and choose **Reconnect** on the Antigravity CLI card. The action validates the
`agy` session and refreshes the detected model, but it does not convert the
session into an API key or change the default model. The provider exposes no
auth profiles or credential environment variables.

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
