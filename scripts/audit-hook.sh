#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  audit-hook.sh — Claude Code hook to log structured tool calls
#
#  Usage:
#    Input: JSON from Claude Code (PreToolUse/PostToolUse)
#    Output: Appends to .claude-loop/audit/audit.jsonl
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

LOG_FILE=".claude-loop/audit/audit.jsonl"
mkdir -p "$(dirname "$LOG_FILE")"

# Read JSON from stdin
DATA=$(cat)

# Extract basic info
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
TOOL=$(echo "$DATA" | jq -r '.tool // "unknown"')
AGENT=${AGENT_ROLE:-"unknown"}
PHASE=$(echo "$DATA" | jq -r '.hook // "unknown"')

# Construct log entry
ENTRY=$(echo "$DATA" | jq -c --arg ts "$TS" --arg agent "$AGENT" --arg phase "$PHASE" \
  '. + {ts: $ts, agent: $agent, phase: $phase}')

echo "$ENTRY" >> "$LOG_FILE"
