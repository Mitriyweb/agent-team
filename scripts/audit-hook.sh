#!/bin/bash
# audit-hook.sh — Log Claude Code tool calls to a unified JSONL file
#
# Usage:
#   echo '{"tool": "Read", "input": {...}}' | bash scripts/audit-hook.sh PRE
#   echo '{"tool": "Read", "status": "success"}' | bash scripts/audit-hook.sh POST

set -euo pipefail

LOG_DIR=".claude-loop/audit"
mkdir -p "$LOG_DIR"

PHASE="${1:-PRE}"
INPUT=$(cat)

TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
ROLE="${ROLE:-unknown}"
AGENT="${AGENT:-unknown}"

# Use a simpler append-only strategy to avoid race conditions with sed
# Each tool call gets two lines: one PRE and one POST, linked by a call_id if available,
# or just logged sequentially.
# For simplicity and reliability in shell, we log each phase as a discrete entry.

if [[ "$PHASE" == "PRE" ]]; then
  TOOL=$(echo "$INPUT" | jq -r '.tool // "unknown"')
  echo "{\"ts\": \"$TIMESTAMP\", \"role\": \"$ROLE\", \"agent\": \"$AGENT\", \"tool\": \"$TOOL\", \"phase\": \"PRE\"}" >> "${LOG_DIR}/audit.jsonl"
else
  TOOL=$(echo "$INPUT" | jq -r '.tool // "unknown"')
  STATUS=$(echo "$INPUT" | jq -r '.status // "success"')
  DURATION=$(echo "$INPUT" | jq -r '.duration_ms // 0')
  echo "{\"ts\": \"$TIMESTAMP\", \"role\": \"$ROLE\", \"agent\": \"$AGENT\", \"tool\": \"$TOOL\", \"phase\": \"POST\", \"status\": \"$STATUS\", \"duration_ms\": $DURATION}" >> "${LOG_DIR}/audit.jsonl"
fi
