#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  lint.sh — Run project linters (Biome + markdownlint)
#
#  Usage:
#    bash scripts/lint.sh              — check only
#    bash scripts/lint.sh --fix        — auto-fix where possible
#    bash scripts/lint.sh --help       — show this help
#
#  Exit codes:
#    0  All checks passed
#    1  Lint errors found
#    2  Invalid arguments
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

FIX=false

for arg in "$@"; do
  case "$arg" in
    --fix)  FIX=true ;;
    --help|-h)
      awk '/^# ─/{if(n++)exit} n{sub(/^# ?/,"");print}' "$0"
      exit 0
      ;;
    *)
      echo "Error: unknown argument '$arg'."
      echo "Usage: bash scripts/lint.sh [--fix]"
      echo "Run with --help for details."
      exit 2
      ;;
  esac
done

ERRORS=0

echo "── Biome ──────────────────────────────────────"
if $FIX; then
  bunx @biomejs/biome check --write . || ERRORS=$((ERRORS + 1))
else
  bunx @biomejs/biome check . || ERRORS=$((ERRORS + 1))
fi

echo ""
echo "── markdownlint ───────────────────────────────"
if $FIX; then
  bunx markdownlint-cli2 --fix "**/*.md" "#node_modules" || ERRORS=$((ERRORS + 1))
else
  bunx markdownlint-cli2 "**/*.md" "#node_modules" || ERRORS=$((ERRORS + 1))
fi

echo ""
if [[ $ERRORS -eq 0 ]]; then
  echo "✓ All lint checks passed"
  exit 0
else
  echo "✗ $ERRORS linter(s) reported errors"
  exit 1
fi
