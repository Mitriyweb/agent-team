#!/bin/bash
# audit-report.sh — Generate a summary table from the audit log
#
# Usage:
#   bash scripts/audit-report.sh

set -euo pipefail

LOG_FILE=".claude-loop/audit/audit.jsonl"

if [[ ! -f "$LOG_FILE" ]]; then
  echo "No audit log found at $LOG_FILE"
  exit 0
fi

echo -e "\n  Audit Report (Tool Call Counts and Error Rates per Agent)\n"
echo -e "  | Agent | Tool | Calls | Success | Errors | Error Rate | Avg Duration |"
echo -e "  |-------|------|-------|---------|--------|------------|--------------|"

# Process JSONL and aggregate results using jq and awk
# We filter for POST phases to get final status and duration
cat "$LOG_FILE" | jq -c 'select(.phase == "POST")' | jq -r '[.agent, .tool, .status, .duration_ms] | @tsv' | sort | \
awk -F'\t' '
{
  key = $1 "\t" $2
  calls[key]++
  if ($3 == "success") success[key]++
  else errors[key]++
  duration[key] += $4
}
END {
  for (key in calls) {
    s = success[key] ? success[key] : 0
    e = errors[key] ? errors[key] : 0
    d = duration[key] / calls[key]
    err_rate = (e / calls[key]) * 100
    printf "  | %s | %d | %d | %d | %.1f%% | %.0fms |\n", key, calls[key], s, e, err_rate, d
  }
}' | sed 's/\t/ | /g'

echo ""
