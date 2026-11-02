#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f "$ROOT/dist/mcp/server.js" ]]; then
  npm run build
fi
exec node --env-file="$ROOT/.env" "$ROOT/dist/mcp/server.js"
