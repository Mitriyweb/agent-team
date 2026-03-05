#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  agents.sh — Launch agents manually
#
#  Usage:
#    ./scripts/agents.sh local   — local model only (Ollama)
#    ./scripts/agents.sh cloud   — Anthropic API only
#    ./scripts/agents.sh both    — hybrid, split view in tmux
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

source "$(dirname "$0")/_common.sh"
load_env

MODE="${1:-}"
LITELLM_URL="${LITELLM_HOST:-http://localhost:8080}"

start_local() {
  log "Starting agent [LOCAL: qwen3-coder]"
  ANTHROPIC_BASE_URL="$LITELLM_URL" \
  ANTHROPIC_API_KEY="local-key" \
  claude --model qwen3-coder
}

start_cloud() {
  log "Starting agent [CLOUD: claude-sonnet]"
  [[ -z "${ANTHROPIC_API_KEY:-}" ]] && err "ANTHROPIC_API_KEY not set"
  ANTHROPIC_BASE_URL="$LITELLM_URL" \
  ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY" \
  claude --model claude-sonnet
}

start_both() {
  command -v tmux &>/dev/null || err "tmux not found. Install: sudo apt install tmux"

  log "Starting both agents in tmux"
  tmux new-session -d -s claude-agents -x 220 -y 50

  tmux send-keys -t claude-agents \
    "ANTHROPIC_BASE_URL=$LITELLM_URL ANTHROPIC_API_KEY=local-key claude --model qwen3-coder" Enter

  tmux split-window -h -t claude-agents
  tmux send-keys -t claude-agents \
    "source .env && ANTHROPIC_BASE_URL=$LITELLM_URL claude --model claude-sonnet" Enter

  tmux select-layout -t claude-agents even-horizontal
  tmux attach -t claude-agents
}

print_header

case "$MODE" in
  local) start_local ;;
  cloud) start_cloud ;;
  both)  start_both ;;
  *)
    echo "Usage: $0 {local|cloud|both}"
    echo ""
    echo "  local  — qwen3-coder via Ollama (requires: docker compose up)"
    echo "  cloud  — claude-sonnet via Anthropic API (requires: ANTHROPIC_API_KEY)"
    echo "  both   — hybrid split view in tmux"
    exit 1
    ;;
esac
