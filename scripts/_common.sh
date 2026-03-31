#!/bin/bash
# Shared helpers — sourced by all scripts

# NEW: Enable xtrace if COVERAGE is set
if [[ -n "${COVERAGE:-}" ]]; then
  # Use an absolute path for trace.log to avoid issues with cd
  : "${TRACE_FILE:=$(pwd)/trace.log}"
  export TRACE_FILE
  # Open FD 3 for appending to TRACE_FILE
  exec 3>>"$TRACE_FILE"
  export BASH_XTRACEFD=3
  set -x
fi

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
BLUE='\033[0;34m'; CYAN='\033[0;36m'; NC='\033[0m'

log()  { echo -e "${CYAN}[$(date '+%H:%M:%S')]${NC} $*"; }
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*" >&2; exit 1; }

notify_review() {
  local msg="Review required"
  if command -v spd-say >/dev/null 2>&1; then
    spd-say "$msg"
  elif command -v say >/dev/null 2>&1; then
    say "$msg"
  else
    printf "\a" # Terminal bell fallback
  fi
}

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
calculate_cost() {
  local model="$1"
  local input_tokens="$2"
  local output_tokens="$3"
  local pricing_file="config/pricing.yaml"

  if [[ ! -f "$pricing_file" ]]; then
    # Fallback to hardcoded defaults if config is missing
    case "$model" in
      *opus*)
        echo "$(awk "BEGIN {print ($input_tokens * 0.000015) + ($output_tokens * 0.000075)}")"
        return
        ;;
      *)
        echo "$(awk "BEGIN {print ($input_tokens * 0.000003) + ($output_tokens * 0.000015)}")"
        return
        ;;
    esac
  fi

  # Try to find exact match or partial match in pricing.yaml
  local input_price output_price
  input_price=$(yq -r ".[\"$model\"].input_per_token // empty" "$pricing_file")
  output_price=$(yq -r ".[\"$model\"].output_per_token // empty" "$pricing_file")

  # If not found, try to fuzzy match (e.g. "claude-3-5-sonnet" matches "claude-sonnet-4-6" if we're not careful,
  # but the task says to read from pricing.yaml. Let's stick to what's there.)
  if [[ -z "$input_price" || "$input_price" == "null" ]]; then
     # Try a simple fallback for common names if not in yaml
     if [[ "$model" == *opus* ]]; then
       input_price=$(yq -r '."claude-opus-4-6".input_per_token' "$pricing_file")
       output_price=$(yq -r '."claude-opus-4-6".output_per_token' "$pricing_file")
     else
       input_price=$(yq -r '."claude-sonnet-4-6".input_per_token' "$pricing_file")
       output_price=$(yq -r '."claude-sonnet-4-6".output_per_token' "$pricing_file")
     fi
  fi

  awk "BEGIN {print ($input_tokens * ${input_price:-0}) + ($output_tokens * ${output_price:-0})}"
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
