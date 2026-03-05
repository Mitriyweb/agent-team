#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  run.sh — Autonomous roadmap execution loop
#
#  Usage:
#    ./scripts/run.sh              — run one task (highest priority)
#    ./scripts/run.sh --all        — run all tasks in sequence
#    ./scripts/run.sh --dry-run    — preview without executing
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

source "$(dirname "$0")/_common.sh"
load_env

ROADMAP="${ROADMAP_FILE:-ROADMAP.md}"
LOG_DIR=".claude-loop/logs"
REPORTS_DIR=".claude-loop/reports"
SESSIONS_DIR=".claude-loop/sessions"
MAX_TURNS="${MAX_TURNS:-20}"
MODE="${1:-}"

mkdir -p "$LOG_DIR" "$REPORTS_DIR" "$SESSIONS_DIR"

# ── Pick next task ────────────────────────────────────────────────
pick_next_task() {
  for priority in high medium low; do
    # Skip tasks with unmet dependencies
    while IFS= read -r line; do
      if echo "$line" | grep -qP 'depends:'; then
        deps=$(echo "$line" | grep -oP 'depends:\K[0-9,]+')
        all_done=true
        for dep in ${deps//,/ }; do
          if ! grep -qP "^\- \[x\] id:${dep}" "$ROADMAP"; then
            all_done=false
            break
          fi
        done
        if $all_done; then
          echo "$line"
          return 0
        fi
      else
        echo "$line"
        return 0
      fi
    done < <(grep -E "^\- \[ \] id:[0-9]+ priority:${priority}" "$ROADMAP")
  done
  return 1
}

get_task_id()   { echo "$1" | grep -oP 'id:\K[0-9]+'; }
get_task_type() { echo "$1" | grep -oP 'type:\K[a-z]+' || echo "feature"; }
get_agents()    { echo "$1" | grep -oP 'agents:\K[a-z,\-]+' || echo ""; }
get_desc()      { echo "$1" | sed 's/^.*priority:[a-z]*//' | sed 's/ type:[a-z]*//' | sed 's/ depends:[0-9,]*//' | sed 's/ agents:[a-z,\-]*//' | xargs; }

mark_status() {
  local task_id="$1" from="$2" to="$3" section="$4"
  sed -i "s/^- \\[${from}\\] \\(id:${task_id} .*\\)$/- [${to}] \1/" "$ROADMAP"
  if grep -q "^## ${section}" "$ROADMAP" 2>/dev/null; then
    task_line=$(grep "^\- \[${to}\] id:${task_id}" "$ROADMAP")
    sed -i "/^\- \[${to}\] id:${task_id}/d" "$ROADMAP"
    sed -i "/^## ${section}/a ${task_line}" "$ROADMAP"
  fi
}

# ── Execute one task ──────────────────────────────────────────────
run_task() {
  local task_line="$1"
  local task_id task_type agents task_desc log_file

  task_id=$(get_task_id "$task_line")
  task_type=$(get_task_type "$task_line")
  agents=$(get_agents "$task_line")
  task_desc=$(get_desc "$task_line")
  log_file="${LOG_DIR}/task-${task_id}.log"

  log "Starting task ${BLUE}#${task_id}${NC} [${task_type}]: ${task_desc}"
  [[ -n "$agents" ]] && log "Agents: ${agents}"

  mark_status "$task_id" " " "~" "in-progress"

  local agents_instruction=""
  if [[ -n "$agents" ]]; then
    agents_instruction="
Agents for this task (in order): ${agents}
Spawn and coordinate only the agents listed above."
  fi

  local prompt
  read -r -d '' prompt <<EOF || true
You are the team-lead autonomous agent executing a task from the project roadmap.

TASK #${task_id} [${task_type}]: ${task_desc}
${agents_instruction}

Instructions:
1. Read the codebase to understand the current state (Read, Glob, Grep)
2. Decompose the task and spawn the appropriate agents
3. Coordinate agents per .claude/agents/PROTOCOL.md
4. Ensure all work is complete and verified
5. Write a report to ${REPORTS_DIR}/task-${task_id}.md:
   - What was done
   - Files changed
   - Key decisions and why
   - Status: SUCCESS or FAILED

Make all decisions autonomously. Do not ask for confirmation.
On the very last line of your output, write exactly one of:
TASK_STATUS: SUCCESS
TASK_STATUS: FAILED: <reason>
EOF

  if [[ "$MODE" == "--dry-run" ]]; then
    warn "[DRY RUN] Would execute: #${task_id} — ${task_desc}"
    mark_status "$task_id" "~" "x" "done"
    return 0
  fi

  local response
  if response=$(claude -p "$prompt" \
      --max-turns "$MAX_TURNS" \
      --output-format json \
      --allowedTools "Read,Write,Edit,Bash,Glob,Grep,Task,Teammate" \
      2>"$log_file"); then

    local result
    result=$(echo "$response" | jq -r '.result // empty' 2>/dev/null || echo "$response")

    echo "$response" | jq -r '.session_id // empty' 2>/dev/null > "${SESSIONS_DIR}/task-${task_id}.session"

    if echo "$result" | grep -q "TASK_STATUS: SUCCESS"; then
      ok "Task #${task_id} completed"
      mark_status "$task_id" "~" "x" "done"
    else
      local reason
      reason=$(echo "$result" | grep "TASK_STATUS: FAILED:" | sed 's/TASK_STATUS: FAILED: //' || echo "unknown")
      err "Task #${task_id} failed: ${reason}"
      mark_status "$task_id" "~" "!" ""
      sed -i "s/^\(- \[!\] id:${task_id} .*\)$/\1 [FAILED: ${reason}]/" "$ROADMAP"
      return 1
    fi
  else
    err "Task #${task_id}: Claude Code returned an error (see ${log_file})"
    mark_status "$task_id" "~" "!" ""
    return 1
  fi
}

# ── Main ──────────────────────────────────────────────────────────
main() {
  print_header

  [[ ! -f "$ROADMAP" ]] && err "ROADMAP.md not found"
  [[ -z "${ANTHROPIC_API_KEY:-}" ]] && err "ANTHROPIC_API_KEY not set in .env"

  if [[ "$MODE" == "--all" || "$MODE" == "--dry-run" ]]; then
    local total=0 passed=0 failed=0
    while task_line=$(pick_next_task 2>/dev/null); do
      total=$((total + 1))
      if run_task "$task_line"; then
        passed=$((passed + 1))
      else
        failed=$((failed + 1))
        warn "Continuing with next task..."
      fi
      sleep 2
    done
    echo ""
    log "Loop finished: ${GREEN}${passed} done${NC}, ${RED}${failed} failed${NC}, ${total} total"
  else
    task_line=$(pick_next_task 2>/dev/null) || { ok "All tasks in ROADMAP.md are done!"; exit 0; }
    run_task "$task_line"
  fi
}

main
