#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  agents.sh — Launch agents manually
#
#  Usage:
#    ./scripts/agents.sh start   — Launch lead agent (cloud API)
#    ./scripts/agents.sh local   — Launch lead agent (local model)
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

source "$(dirname "$0")/_common.sh"

MODE="${1:-}"

start_local() {
  # Local always uses LiteLLM regardless of provider config
  local host="${LITELLM_HOST:-http://localhost:8080}"
  log "Starting lead agent [LOCAL: qwen3-coder] → ${host}"
  log "Sub-agents will be spawned via Task tool."
  ANTHROPIC_BASE_URL="$host" \
  ANTHROPIC_API_KEY="local-key" \
  run_claude --model qwen3-coder --permission-mode manual
}

start_cloud() {
  configure_provider
  log "Starting lead agent [CLOUD: claude-sonnet]"
  log "Sub-agents will be spawned via Task tool."
  run_claude --model claude-sonnet --permission-mode manual
}

print_header

case "$MODE" in
  local) start_local ;;
  start|cloud) start_cloud ;;
  *)
    echo "Usage: $0 {start|local}"
    echo ""
    echo "  start  — Lead agent via cloud API (configured in .env)"
    echo "  local  — Lead agent via local model (Ollama + LiteLLM)"
    exit 1
    ;;
esac
