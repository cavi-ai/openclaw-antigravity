# Installation

## Requirements

- Node.js 20 or newer.
- OpenClaw `2026.7` or newer. The npm peer range is
  `{{OPENCLAW_PEER_VERSION}}`, and plugin installation declares
  `{{OPENCLAW_MIN_HOST_VERSION}}`.
- Gateway `{{OPENCLAW_MIN_GATEWAY_VERSION}}` or newer.
- OpenClaw plugin API `2026.7` or newer (declared as
  `{{OPENCLAW_PLUGIN_API}}`).
- Google's Antigravity CLI (`agy`) 1.2.1 or newer installed on the Gateway host
  and already signed in. Confirm the live session with `agy models`.

Install the package through OpenClaw:

```bash
openclaw plugins install @cavi-ai/antigravity
```

Or install the same scoped npm package globally:

```bash
npm install -g @cavi-ai/antigravity
```

Enable the plugin and restart the Gateway so discovery reloads:

```bash
openclaw config set plugins.entries.antigravity.enabled true
```

If the `plugins` configuration is supplied through a `$include`, edit the
included file directly instead of asking the installer to write through it.
