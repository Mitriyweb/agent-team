#!/bin/bash
# Runs lint and basic checks to validate code implementation.

set -e

echo "Running Biome for linting and formatting..."
npx biome check .

echo "Running markdownlint..."
npx markdownlint-cli2 "**/*.md"

echo "Code validation complete."
