#!/usr/bin/env bash
# Resolve package root (parent of bin/) when run-mcp.sh is invoked via node_modules/.bin symlink.
set -euo pipefail
script="${1:?script path}"
while [[ -L "$script" ]]; do
  dir="$(cd "$(dirname "$script")" && pwd)"
  script="$(readlink "$script")"
  [[ "$script" != /* ]] && script="$dir/$script"
done
cd "$(dirname "$script")/.." && pwd
