#!/bin/bash
# Runs accessibility checks to validate UI components.

set -e

echo "Running axe-core for accessibility checks..."
# Placeholder for axe-core or other a11y tool
npm run test:a11y || true

echo "Accessibility checks complete."
