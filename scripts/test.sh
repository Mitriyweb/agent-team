#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  test.sh — Auto-detect and run project tests
#
#  Usage:
#    bash scripts/test.sh          — run tests
#    bash scripts/test.sh --help
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

if [[ "${1:-}" == "--help" ]]; then
  echo "Usage: bash scripts/test.sh"
  echo "Auto-detects and runs project test runner with coverage."
  exit 0
fi

# Check package.json for test script
if [[ -f "package.json" ]]; then
  if grep -q '"test"' package.json; then
    echo "→ npm test"
    npm test 2>&1 | tee TEST_RESULTS.txt
    exit $?
  fi
fi

# Vitest
if [[ -f "vitest.config.ts" ]] || [[ -f "vitest.config.js" ]]; then
  echo "→ Vitest"
  npx vitest run --coverage 2>&1 | tee TEST_RESULTS.txt
  exit $?
fi

# Jest
if [[ -f "jest.config.ts" ]] || [[ -f "jest.config.js" ]]; then
  echo "→ Jest"
  npx jest --coverage 2>&1 | tee TEST_RESULTS.txt
  exit $?
fi

# Pytest
if [[ -f "pytest.ini" ]] || [[ -f "pyproject.toml" ]] || [[ -f "setup.cfg" ]]; then
  if command -v pytest &>/dev/null; then
    echo "→ Pytest"
    pytest --cov=. --cov-report=term 2>&1 | tee TEST_RESULTS.txt
    exit $?
  fi
fi

# Go
if [[ -f "go.mod" ]]; then
  echo "→ Go test"
  go test -cover ./... 2>&1 | tee TEST_RESULTS.txt
  exit $?
fi

echo "No test runner detected. Add a 'test' script to package.json or configure your test framework."
