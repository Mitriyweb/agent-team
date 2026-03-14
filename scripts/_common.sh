#!/bin/bash
# Shared helpers — sourced by all scripts

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

load_env() {
  local env_file="${1:-.env}"
  if [[ -f "$env_file" ]]; then
    set -a
    # shellcheck disable=SC1090
    source "$env_file"
    set +a
  fi
}

# Portable sed -i (macOS vs Linux)
sed_inplace() {
  if [[ "$(uname)" == "Darwin" ]]; then
    sed -i '' "$@"
  else
    sed -i "$@"
  fi
}

# ── Cost calculation ────────────────────────────────────────────
# Estimates cost based on token usage.
# Claude 3.5 Sonnet: $3/1M input, $15/1M output
# Claude 3 Opus: $15/1M input, $75/1M output
calculate_cost() {
  local model="$1"
  local input_tokens="$2"
  local output_tokens="$3"
  local cost="0"

  case "$model" in
    *opus*)
      cost=$(awk "BEGIN {print ($input_tokens * 0.000015) + ($output_tokens * 0.000075)}")
      ;;
    *sonnet*|*haiku*)
      # Using Sonnet 3.5 prices as default for non-Opus cloud models
      cost=$(awk "BEGIN {print ($input_tokens * 0.000003) + ($output_tokens * 0.000015)}")
      ;;
    *)
      # Local models or unknown
      cost="0"
      ;;
  esac
  echo "$cost"
}

# ── Provider configuration ──────────────────────────────────────
# Reads PROVIDER from .env and exports ANTHROPIC_BASE_URL + ANTHROPIC_API_KEY
# so that `claude` subprocess inherits them.
configure_provider() {
  load_env

  local provider="${PROVIDER:-oauth}"

  case "$provider" in
    oauth)
      # Claude Code already authenticated (via `claude /login`).
      # Optionally route through ANTHROPIC_BASE_URL if set in .env.
      if [[ -n "${ANTHROPIC_BASE_URL:-}" ]]; then
        log "Provider: ${GREEN}OAuth${NC} → ${ANTHROPIC_BASE_URL}"
      else
        log "Provider: ${GREEN}OAuth (direct)${NC}"
      fi
      ;;

    anthropic)
      [[ -z "${ANTHROPIC_API_KEY:-}" ]] && err "ANTHROPIC_API_KEY not set in .env"
      unset ANTHROPIC_BASE_URL 2>/dev/null || true
      log "Provider: ${GREEN}Anthropic (direct)${NC}"
      ;;

    azure-apim)
      [[ -z "${AZURE_APIM_ENDPOINT:-}" ]] && err "AZURE_APIM_ENDPOINT not set in .env"
      [[ -z "${AZURE_APIM_KEY:-}" ]] && err "AZURE_APIM_KEY not set in .env"
      export ANTHROPIC_BASE_URL="$AZURE_APIM_ENDPOINT"
      export ANTHROPIC_AUTH_TOKEN="$AZURE_APIM_KEY"
      unset ANTHROPIC_API_KEY 2>/dev/null || true
      log "Provider: ${GREEN}Azure APIM (key)${NC} → ${AZURE_APIM_ENDPOINT}"
      ;;

    azure-apim-oauth)
      # Uses OAuth session from `claude /login` — no API key needed.
      # Only sets ANTHROPIC_BASE_URL to route requests through APIM.
      [[ -z "${AZURE_APIM_ENDPOINT:-}" ]] && err "AZURE_APIM_ENDPOINT not set in .env"
      export ANTHROPIC_BASE_URL="$AZURE_APIM_ENDPOINT"
      unset ANTHROPIC_API_KEY 2>/dev/null || true
      unset ANTHROPIC_AUTH_TOKEN 2>/dev/null || true
      log "Provider: ${GREEN}Azure APIM (OAuth)${NC} → ${AZURE_APIM_ENDPOINT}"
      ;;

    litellm)
      local host="${LITELLM_HOST:-http://localhost:8080}"
      export ANTHROPIC_BASE_URL="$host"
      export ANTHROPIC_API_KEY="${LITELLM_API_KEY:-local-key}"
      log "Provider: ${GREEN}LiteLLM${NC} → ${host}"
      ;;

    *)
      err "Unknown PROVIDER '${provider}'. Use: oauth, anthropic, azure-apim, azure-apim-oauth, litellm"
      ;;
  esac
}

print_header() {
  echo -e "${BLUE}"
  echo "  ╔══════════════════════════════════════╗"
  echo "  ║    Claude Code Agent Team            ║"
  echo "  ╚══════════════════════════════════════╝"
  echo -e "${NC}"
}
