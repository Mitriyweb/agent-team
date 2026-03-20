#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  validate-spec.sh — Validate SPEC.md structure and completeness
#
#  Usage:
#    bash scripts/validate-spec.sh              — validate SPEC.md
#    bash scripts/validate-spec.sh path/to.md   — validate specific file
#    bash scripts/validate-spec.sh --help
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# NEW: Enable xtrace if COVERAGE is set
if [[ -n "${COVERAGE:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/_common.sh" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
fi

main() {
  if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: bash scripts/validate-spec.sh [SPEC_FILE]"
    echo "Validates that a spec file contains all required sections."
    exit 0
  fi

  SPEC="${1:-SPEC.md}"

  if [[ ! -f "$SPEC" ]]; then
    echo "✗ File not found: $SPEC"
    exit 1
  fi

  REQUIRED_SECTIONS=(
    "Goal"
    "Components"
    "Interfaces"
    "File structure"
    "Risks"
  )

  errors=0
  for section in "${REQUIRED_SECTIONS[@]}"; do
    if grep -qi "## .*${section}" "$SPEC"; then
      echo "✓ Found: ${section}"
    else
      echo "✗ Missing: ${section}"
      errors=$((errors + 1))
    fi
  done

  echo ""
  if [[ $errors -eq 0 ]]; then
    echo "✓ Spec is valid: $SPEC"
  else
    echo "✗ Spec has ${errors} missing section(s)"
    exit 1
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
