#!/usr/bin/env bash
set -euo pipefail
CORE_BIN="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../core/bin" && pwd)"
ROOT="$(bash "$CORE_BIN/resolve-package-root.sh" "${BASH_SOURCE[0]}")"
cd "$ROOT"
if [[ ! -f "$ROOT/dist/mcp/server.js" ]]; then
  npm run build
fi
CORE_ROOT="$(cd "$ROOT/../core" && pwd)"
if [[ ! -f "$CORE_ROOT/dist/pr-workflow/author-tools.js" ]]; then
  (cd "$CORE_ROOT" && npm run build)
fi
exec bash "$CORE_BIN/node-with-package-env.sh" "$ROOT" "$ROOT/dist/mcp/server.js"
