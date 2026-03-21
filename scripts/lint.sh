#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  lint.sh — Auto-detect and run project linters
#
#  Usage:
#    bash scripts/lint.sh         — run linters
#    bash scripts/lint.sh --fix   — run linters with auto-fix
#    bash scripts/lint.sh --help
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# NEW: Enable xtrace if COVERAGE is set
if [[ -n "${COVERAGE:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/_common.sh" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
fi

main() {
  if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: bash scripts/lint.sh [--fix]"
    echo "Auto-detects and runs available linters (biome, eslint, markdownlint)."
    exit 0
  fi

  FIX="${1:-}"
  found=0

  # Biome
  if command -v biome &>/dev/null || [[ -f "node_modules/.bin/biome" ]]; then
    BIOME="${BIOME:-$(command -v biome 2>/dev/null || echo "npx @biomejs/biome")}"
    if [[ "$FIX" == "--fix" ]]; then
      echo "→ Biome (fix)"
      $BIOME check --write .
    else
      echo "→ Biome"
      $BIOME check .
    fi
    found=1
  fi

  # ESLint
  if command -v eslint &>/dev/null || [[ -f "node_modules/.bin/eslint" ]]; then
    ESLINT="${ESLINT:-$(command -v eslint 2>/dev/null || echo "npx eslint")}"
    if [[ "$FIX" == "--fix" ]]; then
      echo "→ ESLint (fix)"
      $ESLINT --fix .
    else
      echo "→ ESLint"
      $ESLINT .
    fi
    found=1
  fi

  # markdownlint
  if command -v markdownlint-cli2 &>/dev/null || [[ -f "node_modules/.bin/markdownlint-cli2" ]]; then
    MDLINT="${MDLINT:-$(command -v markdownlint-cli2 2>/dev/null || echo "npx markdownlint-cli2")}"
    if [[ "$FIX" == "--fix" ]]; then
      echo "→ markdownlint (fix)"
      $MDLINT --fix "**/*.md" "#node_modules"
    else
      echo "→ markdownlint"
      $MDLINT "**/*.md" "#node_modules"
    fi
    found=1
  fi

  if [[ $found -eq 0 ]]; then
    echo "No linters found. Install biome, eslint, or markdownlint-cli2."
    return 0
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
