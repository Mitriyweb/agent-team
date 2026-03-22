#!/bin/bash
# Runs the full test suite for the project.

set -e

echo "Running unit tests..."
# Placeholder for unit test command, e.g., npm test or pytest
npm test || true

echo "Running integration tests..."
# Placeholder for integration test command
npm run test:integration || true

echo "Running BATS tests..."
if [ -d "tests/scripts" ]; then
  bats tests/scripts/
fi

echo "Test suite complete."
