#!/usr/bin/env bash
# Run node with optional package .env. Variables already set (e.g. Cursor mcp.json "env") are not overridden.
set -euo pipefail
PKG_ROOT="${1:?package root}"
ENTRY="${2:?entry script}"
shift 2
if [[ -f "$PKG_ROOT/.env" ]]; then
  exec node --env-file="$PKG_ROOT/.env" "$ENTRY" "$@"
fi
exec node "$ENTRY" "$@"
