# Doctor and compatibility

Version {{PRODUCT_VERSION}} declares these OpenClaw boundaries from
`package.json`:

| Boundary | Declared value |
| --- | --- |
| npm peer dependency | `{{OPENCLAW_PEER_VERSION}}` |
| minimum host install version | `{{OPENCLAW_MIN_HOST_VERSION}}` |
| plugin API | `{{OPENCLAW_PLUGIN_API}}` |
| minimum Gateway | `{{OPENCLAW_MIN_GATEWAY_VERSION}}` |

The package-root doctor contract associates `antigravity-cli`, `antigravity`,
and `agy` session-route identifiers with this plugin. When the provider is
registered, doctor can name it while diagnosing a missing executable or an
unavailable CLI login.

Doctor runs after discovery. If the plugin is absent from the plugin list,
doctor cannot repair discovery: fix installation, enablement, and Gateway
restart first. Then use `agy models` to distinguish CLI availability or login
problems from OpenClaw model-policy problems.
