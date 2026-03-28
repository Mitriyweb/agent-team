#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  bash_coverage.sh — Pure Bash/Awk coverage analysis
#
#  Usage:
#    bash scripts/bash_coverage.sh trace.log script1.sh script2.sh ...
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'

if [[ $# -lt 2 ]]; then
    echo "Usage: bash $0 trace.log script1.sh script2.sh ..."
    exit 1
fi

TRACE_FILE="$1"
shift
SCRIPTS=("$@")

if [[ ! -f "$TRACE_FILE" ]]; then
    echo "Trace file $TRACE_FILE not found."
    exit 1
fi

# 1. Parse trace file to find executed lines
# Format: ++ /path/to/file.sh:123: ...
# We use awk to build a map of file:line
TMP_EXECUTED=$(mktemp)
grep -E '^\++\s+.*:[0-9]+:' "$TRACE_FILE" | sed -E 's/^\++\s+//' | cut -d: -f1,2 | sort -u > "$TMP_EXECUTED"

# 2. Process each script
TOTAL_EXECUTABLE=0
TOTAL_COVERED=0

printf "%-40s %-10s %-10s %-10s\n" "File" "Covered" "Total" "%"
echo "---------------------------------------------------------------------------"

for SCRIPT in "${SCRIPTS[@]}"; do
    if [[ ! -f "$SCRIPT" ]]; then
        printf "%-40s Not found\n" "$SCRIPT"
        continue
    fi

    ABS_SCRIPT=$(readlink -f "$SCRIPT")
    # Portable relative path (if possible) otherwise use ABS_SCRIPT
    REL_SCRIPT="$SCRIPT"

    # Get executable lines from source
    # Skip comments, empty lines, and structural keywords
    EXECUTABLE_LINES=$(awk '
        {
            gsub(/^[ \t]+|[ \t]+$/, "", $0)
            if ($0 == "" || $0 ~ /^#/) next
            if ($0 ~ /^\{$|^\}$|^then$|^else$|^fi$|^done$|^esac$|^do$|^\($|^\)$|^;;$/) next
            if ($0 ~ /^[a-zA-Z0-9_-]+\(\)\s*\{/) next
            print NR
        }
    ' "$ABS_SCRIPT")

    NUM_EXECUTABLE=$(echo "$EXECUTABLE_LINES" | grep -c . || echo 0)
    
    if [[ $NUM_EXECUTABLE -eq 0 ]]; then
        printf "%-40s %-10s %-10s %10s\n" "$REL_SCRIPT" 0 0 "100.00%"
        continue
    fi

    # Find covered lines (present in trace and executable)
    COVERED_COUNT=0
    UNCOVERED_LINES=""
    
    while read -r LINE; do
        if grep -qF "${ABS_SCRIPT}:${LINE}" "$TMP_EXECUTED" || grep -qF "${REL_SCRIPT}:${LINE}" "$TMP_EXECUTED"; then
            COVERED_COUNT=$((COVERED_COUNT + 1))
        else
            if [[ ${#UNCOVERED_LINES} -lt 100 ]]; then
                UNCOVERED_LINES="${UNCOVERED_LINES}${LINE} "
            fi
        fi
    done <<< "$EXECUTABLE_LINES"

    PERCENTAGE=$(awk "BEGIN {printf \"%.2f\", ($COVERED_COUNT / $NUM_EXECUTABLE) * 100}")
    
    printf "%-40s %-10s %-10s %9s%%\n" "$REL_SCRIPT" "$COVERED_COUNT" "$NUM_EXECUTABLE" "$PERCENTAGE"
    
    if [[ -n "$UNCOVERED_LINES" ]]; then
        echo -e "  ${YELLOW}Uncovered lines:${NC} ${UNCOVERED_LINES% }..."
    fi

    TOTAL_EXECUTABLE=$((TOTAL_EXECUTABLE + NUM_EXECUTABLE))
    TOTAL_COVERED=$((TOTAL_COVERED + COVERED_COUNT))
done

echo "---------------------------------------------------------------------------"
TOTAL_PERCENTAGE=$(awk "BEGIN {printf \"%.2f\", ($TOTAL_COVERED / $TOTAL_EXECUTABLE) * 100}")
printf "%-40s %-10s %-10s %9s%%\n" "TOTAL" "$TOTAL_COVERED" "$TOTAL_EXECUTABLE" "$TOTAL_PERCENTAGE"

rm -f "$TMP_EXECUTED"

if (( $(echo "$TOTAL_PERCENTAGE < 85.0" | bc -l) )); then
    echo -e "\n${RED}Coverage too low: ${TOTAL_PERCENTAGE}% < 85%${NC}"
    exit 1
fi
