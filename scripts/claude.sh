#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  claude.sh — Launch Claude Code with provider from .env
#
#  Usage:
#    ./scripts/claude.sh              — interactive Claude Code
#    ./scripts/claude.sh -p "prompt"  — headless mode
#    ./scripts/claude.sh --resume     — resume last session
#
#  All arguments are passed through to `claude`.
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

main() {
  configure_provider
  exec claude "$@"
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
