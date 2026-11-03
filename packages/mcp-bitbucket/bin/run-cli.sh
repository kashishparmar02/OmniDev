#!/usr/bin/env bash
# CLI helper: optional .env; existing process env (e.g. exported vars) is kept when .env is absent.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
ARGS=("$@")
if [[ -f "$ROOT/.env" ]]; then
  exec node --env-file="$ROOT/.env" --import tsx src/cli.ts "${ARGS[@]}"
fi
exec node --import tsx src/cli.ts "${ARGS[@]}"
