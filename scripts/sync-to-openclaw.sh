#!/usr/bin/env bash
# Copy this repo into an OpenClaw extensions directory for local testing.
#
# The repo is canonical; the extensions directory is a build output. A symlink
# does not work here: the CLI follows it, but the Gateway's plugin discovery does
# not, so the provider is missing from the published model catalog and every
# Gateway-routed turn fails with "prepared model catalog owner was not published".
#
# Usage:
#   scripts/sync-to-openclaw.sh              # sync, then restart the gateway
#   scripts/sync-to-openclaw.sh --no-restart # sync only
set -euo pipefail

repo_root=$(CDPATH= cd -P "$(dirname "$0")/.." && pwd)
plugin_id=$(node -p "require('$repo_root/openclaw.plugin.json').id")

state_dir="${OPENCLAW_STATE_DIR:-}"
if [ -z "$state_dir" ] && [ -n "${OPENCLAW_HOME:-}" ]; then
  if [ -f "$OPENCLAW_HOME/openclaw.json" ]; then
    state_dir="$OPENCLAW_HOME"
  elif [ -f "$OPENCLAW_HOME/.openclaw/openclaw.json" ]; then
    state_dir="$OPENCLAW_HOME/.openclaw"
  fi
fi
[ -n "$state_dir" ] || state_dir="$HOME/.openclaw"

if [ ! -f "$state_dir/openclaw.json" ]; then
  echo "sync: no openclaw.json under $state_dir; set OPENCLAW_STATE_DIR" >&2
  exit 1
fi

target="$state_dir/extensions/$plugin_id"

npm test --prefix "$repo_root"

mkdir -p "$target"
rsync -a --delete \
  --exclude node_modules --exclude .git --exclude .github --exclude scripts \
  "$repo_root/" "$target/"
echo "sync: $repo_root -> $target"

if [ "${1:-}" = "--no-restart" ]; then
  echo "sync: skipped gateway restart; run 'openclaw gateway restart --force' to load it"
  exit 0
fi

# The Gateway resolves plugins once at startup, so a running instance keeps
# serving the previous copy until it is restarted.
openclaw gateway restart --force
echo "sync: gateway restarted"
