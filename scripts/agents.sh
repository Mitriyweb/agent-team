#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  agents.sh — Launch agents manually
#
#  Usage:
#    ./scripts/agents.sh local   — local model only (Ollama)
#    ./scripts/agents.sh cloud   — cloud API (Anthropic / Azure APIM per config)
#    ./scripts/agents.sh both    — hybrid, split view in tmux
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

source "$(dirname "$0")/_common.sh"

MODE="${1:-}"

start_local() {
  # Local always uses LiteLLM regardless of provider config
  local host="${LITELLM_HOST:-http://localhost:8080}"
  log "Starting agent [LOCAL: qwen3-coder] → ${host}"
  ANTHROPIC_BASE_URL="$host" \
  ANTHROPIC_API_KEY="local-key" \
  run_claude --model qwen3-coder
}

start_cloud() {
  configure_provider
  log "Starting agent [CLOUD: claude-sonnet]"
  run_claude --model claude-sonnet
}

start_both() {
  command -v tmux &>/dev/null || err "tmux not found. Install: brew install tmux / apt install tmux"

  configure_provider
  local host="${LITELLM_HOST:-http://localhost:8080}"

  log "Starting both agents in tmux"
  tmux new-session -d -s claude-agents -x 220 -y 50

  # Left pane: local model via LiteLLM
  tmux send-keys -t claude-agents \
    "ANTHROPIC_BASE_URL=$host ANTHROPIC_API_KEY=local-key run_claude --model qwen3-coder" Enter

  # Right pane: cloud model via configured provider
  tmux split-window -h -t claude-agents
  local cloud_env="ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY"
  [[ -n "${ANTHROPIC_BASE_URL:-}" ]] && cloud_env="ANTHROPIC_BASE_URL=$ANTHROPIC_BASE_URL $cloud_env"
  tmux send-keys -t claude-agents \
    "$cloud_env run_claude --model claude-sonnet" Enter

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
    echo "  cloud  — cloud model via configured provider (see .env)"
    echo "  both   — hybrid split view in tmux"
    exit 1
    ;;
esac
