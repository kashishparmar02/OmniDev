#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
if [[ ! -f "$ROOT/dist/mcp/server.js" ]]; then
  npm run build
fi
# Build core if author scripts path is missing from dist layout
CORE_ROOT="$(cd "$ROOT/../core" && pwd)"
if [[ ! -f "$CORE_ROOT/dist/pr-workflow/author-tools.js" ]]; then
  (cd "$CORE_ROOT" && npm run build)
fi
exec node "$ROOT/dist/mcp/server.js"
