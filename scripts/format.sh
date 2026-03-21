#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  format.sh — Auto-detect and run code formatter
#
#  Usage:
#    bash scripts/format.sh        — format code
#    bash scripts/format.sh --help
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# NEW: Enable xtrace if COVERAGE is set
if [[ -n "${COVERAGE:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/_common.sh" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
fi

main() {
  if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: bash scripts/format.sh"
    echo "Auto-detects and runs available formatter (biome, prettier)."
    exit 0
  fi

  # Biome
  if command -v biome &>/dev/null || [[ -f "node_modules/.bin/biome" ]]; then
    BIOME="${BIOME:-$(command -v biome 2>/dev/null || echo "npx @biomejs/biome")}"
    echo "→ Biome format"
    $BIOME check --write .
    return 0
  fi

  # Prettier
  if command -v prettier &>/dev/null || [[ -f "node_modules/.bin/prettier" ]]; then
    PRETTIER="${PRETTIER:-$(command -v prettier 2>/dev/null || echo "npx prettier")}"
    echo "→ Prettier"
    $PRETTIER --write .
    return 0
  fi

  echo "No formatter found. Install biome or prettier."
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
