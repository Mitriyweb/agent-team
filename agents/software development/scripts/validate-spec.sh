#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  validate-spec.sh — Validate SPEC.md structure and completeness
#
#  Usage:
#    bash scripts/validate-spec.sh                — validate ./SPEC.md
#    bash scripts/validate-spec.sh path/SPEC.md   — validate a specific file
#    bash scripts/validate-spec.sh --help         — show this help
#
#  Checks that the spec contains the required sections:
#    ## Goal
#    ## Components and responsibilities
#    ## Interfaces
#    ## File structure
#    ## What NOT to change
#
#  Exit codes:
#    0  Spec is valid
#    1  Missing sections or file not found
#    2  Invalid arguments
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

for arg in "$@"; do
  case "$arg" in
    --help|-h)
      awk '/^# ─/{if(n++)exit} n{sub(/^# ?/,"");print}' "$0"
      exit 0
      ;;
  esac
done

SPEC_FILE="${1:-SPEC.md}"

if [[ ! -f "$SPEC_FILE" ]]; then
  echo "Error: file not found: $SPEC_FILE"
  echo "Usage: bash scripts/validate-spec.sh [SPEC_FILE]"
  exit 1
fi

REQUIRED_SECTIONS=(
  "## Goal"
  "## Components and responsibilities"
  "## Interfaces"
  "## File structure"
  "## What NOT to change"
)

MISSING=()
for section in "${REQUIRED_SECTIONS[@]}"; do
  if ! grep -qi "^${section}" "$SPEC_FILE"; then
    MISSING+=("$section")
  fi
done

echo "File: $SPEC_FILE"
echo "Sections checked: ${#REQUIRED_SECTIONS[@]}"

if [[ ${#MISSING[@]} -eq 0 ]]; then
  echo "Status: ✓ valid"
  echo "All required sections present."
  exit 0
else
  echo "Status: ✗ invalid"
  echo "Missing sections:"
  for s in "${MISSING[@]}"; do
    echo "  - $s"
  done
  exit 1
fi
