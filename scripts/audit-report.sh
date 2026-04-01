#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  audit-report.sh — Generate summary from tool audit log
#
#  Usage:
#    ./scripts/audit-report.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

LOG_FILE=".claude-loop/audit/audit.jsonl"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "No audit log found at $LOG_FILE"
  exit 0
fi

echo "Tool Call Audit Report"
echo "======================"
echo ""

# Table header
printf "%-15s %-15s %-15s %-10s\n" "Agent" "Tool" "Calls" "Errors"
printf "%-15s %-15s %-15s %-10s\n" "-----" "----" "-----" "------"

# Group by agent and tool, count total and errors
jq -s 'group_by(.agent, .tool) | .[] | {
  agent: .[0].agent,
  tool: .[0].tool,
  count: length,
  errors: (map(select(.status == "error")) | length)
}' "$LOG_FILE" | jq -r '[.agent, .tool, .count, .errors] | @tsv' | while IFS=$'\t' read -r agent tool count errors; do
  printf "%-15s %-15s %-15s %-10s\n" "$agent" "$tool" "$count" "$errors"
done
