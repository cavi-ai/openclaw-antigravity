# Authentication

The plugin does not create or store Antigravity credentials. `agy` owns the
login session, so sign in through `agy` and confirm the session with:

```bash
agy models
```

OpenClaw registers a guided CLI authentication choice for discovery,
onboarding, and reconnect. The action validates the `agy` session and refreshes
the detected model, but it does not convert the session into an API key. The
provider exposes no auth profiles or credential environment variables.

## Recovery

If a previously working session stops authenticating:

1. Run `agy models` as the Gateway user.
2. If that command reports an expired or missing session, complete the login
   flow in `agy`; do not paste an API key into OpenClaw for this provider.
3. Run `agy models` again before retrying OpenClaw.
4. Choose **Reconnect** when the connected Control UI exposes the provider's
   guided setup action.
5. If the command works interactively but not in the Gateway, configure an
   absolute `command` path and verify both processes use the same OS account and
   environment.
