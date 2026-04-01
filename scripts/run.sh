#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  run.sh — Autonomous roadmap execution loop
#
#  Usage:
#    ./scripts/run.sh              — run one task (highest priority)
#    ./scripts/run.sh --all        — run all tasks in sequence
#    ./scripts/run.sh --dry-run    — preview without executing
#    ./scripts/run.sh --resume ID  — resume from task ID
#    ./scripts/run.sh --budget USD — set budget limit
#    ./scripts/run.sh --retry-limit N — retry failed tasks N times
#    ./scripts/run.sh --approve-plan — wait for human approval of plans
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# NEW: Enable xtrace if COVERAGE is set
if [[ -n "${COVERAGE:-}" ]]; then
  : "${TRACE_FILE:=$(pwd)/trace.log}"
  export TRACE_FILE
  exec 3>>"$TRACE_FILE"
  export BASH_XTRACEFD=3
  set -x
fi

source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"

# Use tasks/plan.md if it exists, otherwise ROADMAP.md
if [[ -n "${ROADMAP_FILE:-}" ]]; then
  ROADMAP="$ROADMAP_FILE"
elif [[ -f "tasks/plan.md" ]]; then
  ROADMAP="tasks/plan.md"
else
  ROADMAP="ROADMAP.md"
fi
LOG_DIR=".claude-loop/logs"
REPORTS_DIR=".claude-loop/reports"
SESSIONS_DIR=".claude-loop/sessions"
MAX_TURNS="${MAX_TURNS:-20}"
RUN_ALL=false
DRY_RUN=false
FORCE_RESTART=false
RESUME_ID=""
RETRY_LIMIT=0
BUDGET=0
APPROVE_PLAN=false
STOP_REQUESTED=false
TEAM="software development"
USE_BRANCH=false
PLAN_FIRST=false

count_tasks() {
  local done failed pending running total
  done=$(get_roadmap_tasks 'x' | wc -l | tr -d ' ')
  failed=$(get_roadmap_tasks '!' | wc -l | tr -d ' ')
  pending=$(get_roadmap_tasks ' ' | wc -l | tr -d ' ')
  running=$(get_roadmap_tasks '~' | wc -l | tr -d ' ')
  total=$((done + failed + pending + running))
  echo "${done}|${failed}|${pending}|${running}|${total}"
}

format_duration() {
  local secs=$1
  if (( secs < 60 )); then
    echo "${secs}s"
  elif (( secs < 3600 )); then
    echo "$((secs / 60))m $((secs % 60))s"
  else
    echo "$((secs / 3600))h $((secs % 3600 / 60))m"
  fi
}

SPINNER_PID=""
TASK_START_TIME=""

show_progress_bar() {
  local task_id="$1" task_desc="$2" task_num="$3" task_total="$4"
  local cols
  cols=$(tput cols 2>/dev/null || echo 80)

  (
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while true; do
      local elapsed=$(( $(date +%s) - TASK_START_TIME ))
      local elapsed_fmt
      elapsed_fmt=$(format_duration $elapsed)

      local counts
      counts=$(count_tasks)
      local done=${counts%%|*}; counts=${counts#*|}
      local failed=${counts%%|*}; counts=${counts#*|}

      local status_line="${frames[$i]} ${CYAN}[${task_num}/${task_total}]${NC} Task ${BLUE}#${task_id}${NC} running... ${YELLOW}${elapsed_fmt}${NC}  ┃  ${GREEN}✓${done}${NC} ${RED}✗${failed}${NC}"

      local clean_line
      clean_line=$(echo -e "$status_line" | sed 's/\x1b\[[0-9;]*m//g')
      if (( ${#clean_line} > cols )); then
        status_line="${frames[$i]} ${CYAN}[${task_num}/${task_total}]${NC} #${task_id} ${YELLOW}${elapsed_fmt}${NC} ${GREEN}✓${done}${NC} ${RED}✗${failed}${NC}"
      fi

      printf "\r\033[K%b" "$status_line" >&2
      i=$(( (i + 1) % ${#frames[@]} ))
      sleep 1
    done
  ) &
  SPINNER_PID=$!
}

stop_progress_bar() {
  if [[ -n "$SPINNER_PID" ]] && kill -0 "$SPINNER_PID" 2>/dev/null; then
    kill "$SPINNER_PID" 2>/dev/null
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    printf "\r\033[K" >&2
  fi
}

print_dashboard() {
  local counts
  counts=$(count_tasks)
  local done=${counts%%|*}; counts=${counts#*|}
  local failed=${counts%%|*}; counts=${counts#*|}
  local pending=${counts%%|*}; counts=${counts#*|}
  local running=${counts%%|*}; counts=${counts#*|}
  local total=${counts%%|*}

  echo ""
  echo -e "  ${CYAN}┌─────────────────────────────────┐${NC}"
  echo -e "  ${CYAN}│${NC}  ${GREEN}✓ Done:${NC}    ${done}                   ${CYAN}│${NC}"
  echo -e "  ${CYAN}│${NC}  ${RED}✗ Failed:${NC}  ${failed}                   ${CYAN}│${NC}"
  echo -e "  ${CYAN}│${NC}  ${YELLOW}○ Pending:${NC} ${pending}                   ${CYAN}│${NC}"
  echo -e "  ${CYAN}│${NC}  ${BLUE}~ Running:${NC} ${running}                   ${CYAN}│${NC}"
  echo -e "  ${CYAN}│${NC}  Total:    ${total}                   ${CYAN}│${NC}"
  echo -e "  ${CYAN}└─────────────────────────────────┘${NC}"
  echo ""
}

cleanup() {
  stop_progress_bar
  echo ""
  warn "Stop requested — finishing current task then exiting..."
  STOP_REQUESTED=true
}
trap cleanup SIGINT SIGTERM

get_roadmap_tasks() {
  local status_filter="${1:-.}"
  local in_block=false
  local line
  while IFS= read -r line || [[ -n "$line" ]]; do
    line=$(echo "$line" | tr -d '\r')
    if echo "$line" | grep -qE '^```'; then
      if $in_block; then in_block=false; else in_block=true; fi
      continue
    fi
    if $in_block && echo "$line" | grep -qE "^- \[${status_filter}\] id:[0-9]+"; then
      echo "$line"
    fi
  done < "$ROADMAP"
}

validate_roadmap() {
  log "Validating roadmap ${BLUE}${ROADMAP}${NC}..."
  local errors=0
  if ! grep -q '^\`\`\`' "$ROADMAP"; then
    warn "Roadmap should contain tasks inside \` \` \` blocks"
  fi
  local tasks
  tasks=$(get_roadmap_tasks | grep '.' || true)
  if [[ -z "$tasks" ]]; then
    ok "Roadmap is empty. Add tasks to ${BLUE}${ROADMAP}${NC} to start."
    exit 0
  fi
  local ids
  ids=$(echo "$tasks" | grep -oE 'id:[0-9]+' | sed 's/id://' | sort)
  local dups
  dups=$(echo "$ids" | uniq -d)
  if [[ -n "$dups" ]]; then
    for id in $dups; do
      warn "Duplicate task ID found: ${id}"
      errors=$((errors + 1))
    done
  fi
  while IFS= read -r line; do
    local tid
    tid=$(get_task_id "$line")
    if ! echo "$line" | grep -qE 'priority:(high|medium|low)'; then
      warn "Task #${tid} missing valid priority (high|medium|low)"
      errors=$((errors + 1))
    fi
    if ! echo "$line" | grep -qE 'type:[a-z]+'; then
      warn "Task #${tid} missing type"
      errors=$((errors + 1))
    fi
    if echo "$line" | grep -qE 'depends:'; then
      local deps
      deps=$(echo "$line" | sed -n 's/.*depends:\([0-9,]*\).*/\1/p')
      for dep in ${deps//,/ }; do
        if ! echo "$ids" | grep -qE "(^| )${dep}( |$)" ; then
          warn "Task #${tid} depends on non-existent task #${dep}"
          errors=$((errors + 1))
        fi
      done
    fi
  done <<< "$tasks"
  if [[ $errors -gt 0 ]]; then
    err "Roadmap validation failed with ${errors} error(s)"
  fi

  # Task size validation
  while IFS= read -r line; do
    local tid desc
    tid=$(get_task_id "$line")
    desc=$(get_desc "$line")
    if (( $(echo "$desc" | wc -w) > 500 )); then
      warn "Task #${tid} description is too long (>500 words). Consider splitting it."
    fi
    if ! echo "$line" | grep -qE 'agents:'; then
      warn "Task #${tid} has no explicit scope (agents). This may lead to an over-broad task."
    fi
  done <<< "$tasks"

  ok "Roadmap valid"
}

pick_next_task() {
  local done_tasks failed_tasks pending_tasks
  done_tasks=$(get_roadmap_tasks 'x')
  failed_tasks=$(get_roadmap_tasks '!')
  pending_tasks=$(get_roadmap_tasks ' ')
  if [[ -z "$pending_tasks" ]]; then
    return 1
  fi
  local has_blocked=false
  for priority in high medium low; do
    while IFS= read -r line; do
      [[ -z "$line" ]] && continue
      if echo "$line" | grep -qE 'depends:'; then
        local deps all_met=true
        deps=$(echo "$line" | sed -n 's/.*depends:\([0-9,]*\).*/\1/p')
        for dep in ${deps//,/ }; do
          if echo "$failed_tasks" | grep -qE "id:${dep} "; then
            all_met=false
            break
          fi
          if ! echo "$done_tasks" | grep -qE "id:${dep} "; then
            all_met=false
            has_blocked=true
            break
          fi
        done
        if $all_met; then
          echo "$line"
          return 0
        fi
      else
        echo "$line"
        return 0
      fi
    done <<< "$(echo "$pending_tasks" | grep -E "priority:${priority}" || true)"
  done
  if $has_blocked; then
    return 2
  fi
  return 1
}

get_task_id()   { echo "$1" | grep -oE 'id:[0-9]+' | sed 's/id://'; }
get_task_type() { echo "$1" | grep -oE 'type:[a-z]+' | sed 's/type://' || echo "feature"; }
get_agents()    { echo "$1" | grep -oE 'agents:[a-z,\-]+' | sed 's/agents://' || echo ""; }
get_desc()      { echo "$1" | sed 's/^.*priority:[a-z]*//' | sed 's/ type:[a-z]*//' | sed 's/ depends:[0-9,]*//' | sed 's/ agents:[a-z,\-]*//' | xargs; }

COST_SUMMARY_FILE="${REPORTS_DIR}/cost-summary.json"

get_cumulative_cost() {
  if [[ -f "$COST_SUMMARY_FILE" ]]; then
    jq -r '.total_cost // 0' "$COST_SUMMARY_FILE"
  else
    echo "0"
  fi
}

update_cost() {
  local task_id="$1" cost="$2"
  local current_total
  current_total=$(get_cumulative_cost)
  local new_total
  new_total=$(awk "BEGIN {print $current_total + $cost}")
  if [[ ! -f "$COST_SUMMARY_FILE" ]]; then
    echo "{\"total_cost\": $new_total, \"tasks\": {}}" > "$COST_SUMMARY_FILE"
  fi
  local tmp_file
  tmp_file=$(mktemp)
  jq --arg tid "$task_id" --argjson cost "$cost" --argjson total "$new_total" \
    '.total_cost = $total | .tasks[$tid] = $cost' "$COST_SUMMARY_FILE" > "$tmp_file" && mv "$tmp_file" "$COST_SUMMARY_FILE"
}

get_task_spec() {
  local task_id="$1"
  local in_block=false
  local spec=""
  while IFS= read -r line; do
    if echo "$line" | grep -qE "^### Task #${task_id} "; then
      in_block=true
      spec="$line"
      continue
    fi
    if $in_block; then
      if echo "$line" | grep -qE "^### Task #" ; then
        break
      fi
      spec="${spec}
${line}"
    fi
  done < "$ROADMAP"
  echo "$spec"
}

mark_status() {
  local task_id="$1" from="$2" to="$3"
  awk -v id="$task_id" -v from="$from" -v to="$to" '
    BEGIN { done=0 }
    !done && $0 ~ "^- \\[" from "\\] id:" id " " {
      sub("^- \\[" from "\\]", "- [" to "]")
      done=1
    }
    { print }
  ' "$ROADMAP" > "${ROADMAP}.tmp" && mv "${ROADMAP}.tmp" "$ROADMAP"
}

run_task() {
  local task_line="$1"
  local task_id task_type agents task_desc log_file
  task_id=$(get_task_id "$task_line")
  task_type=$(get_task_type "$task_line")
  agents=$(get_agents "$task_line")
  task_desc=$(get_desc "$task_line")

  # Task chunking logic
  local max_files
  max_files=$(echo "$task_line" | grep -oE 'max_files:[0-9]+' | sed 's/max_files://' || echo "0")
  if [[ "$max_files" -gt 0 ]]; then
    log "Task #${task_id} exceeds file limit of ${max_files}. Splitting into sub-tasks..."
    # Automatic chunking implementation:
    # Instead of one large task, we'll spawn multiple sub-agents in sequence
    # to handle parts of the file set. This is reflected in the team-lead's prompt.
    agents_instruction="${agents_instruction:-}
IMPORTANT: This is a large task. Split it into at least $(( (max_files / 5) + 1 )) sub-tasks,
handling no more than 5 files per sub-agent turn."
  fi
  log_file="${LOG_DIR}/task-${task_id}.log"
  log "Starting task ${BLUE}#${task_id}${NC} [${task_type}]: ${task_desc}"
  [[ -n "$agents" ]] && log "  Agents: ${agents}"
  if [[ $(awk "BEGIN {print ($BUDGET > 0)}") -eq 1 ]]; then
    local current_cost
    current_cost=$(get_cumulative_cost)
    if [[ $(awk "BEGIN {print ($current_cost >= $BUDGET)}") -eq 1 ]]; then
      err "Budget exceeded: ${current_cost} >= ${BUDGET}"
    fi
  fi
  mark_status "$task_id" " " "~"
  TASK_START_TIME=$(date +%s)
  local agents_instruction=""
  if [[ -n "$agents" ]]; then
    agents_instruction="
Agents for this task (in order): ${agents}
Spawn and coordinate only the agents listed above."
  fi
  local original_branch=""
  local branch_name="task/${task_id}"
  if $USE_BRANCH && [[ "$MODE" != "--dry-run" ]]; then
    if [[ -z "${GH_TOKEN:-}" ]]; then
      err "GH_TOKEN must be set to use feature-branch workflow. Use --no-branch to skip."
    fi
    original_branch=$(git branch --show-current)
    log "Creating branch ${BLUE}${branch_name}${NC}..."
    git checkout -b "$branch_name" 2>/dev/null || git checkout "$branch_name"
  fi
  local task_spec
  task_spec=$(get_task_spec "$task_id")
  local spec_block=""
  if [[ -n "$task_spec" ]]; then
    spec_block="

## Detailed specification

${task_spec}"
  fi
  local prompt
  local hitl_instruction=""
  if $APPROVE_PLAN; then
    hitl_instruction="
IMPORTANT: After Phase 1 (Design/Planning) is complete and you have a solid plan from the architect, STOP and output 'TASK_STATUS: PENDING_APPROVAL'.
Wait for human approval before proceeding to Phase 2 (Implementation)."
  fi
  local protocol_file="sw-PROTOCOL.md"
  if [[ "$TEAM" == "localization" ]]; then
    protocol_file="loc-PROTOCOL.md"
  elif [[ "$TEAM" == "frontend" ]]; then
    protocol_file="PROTOCOL.md"
  fi
  # Ensure MEMORY.md exists
  if [[ ! -f "MEMORY.md" ]]; then
    cat <<EOF > "MEMORY.md"
# Project Memory

This file serves as a persistent memory for all agents.
EOF
  fi

  read -r -d '' prompt <<EOF || true
You are the ${TEAM}-lead autonomous agent executing a task from the project roadmap.
${hitl_instruction}

TASK #${task_id} [${task_type}]: ${task_desc}
${agents_instruction}
${spec_block}

Instructions:
1. Read the detailed specification above carefully — it defines EXACTLY what to produce
2. Read the codebase to understand the current state (Read, Glob, Grep)
3. Decompose the task and spawn the appropriate agents
4. Coordinate agents per agents/${TEAM}/${protocol_file}
5. Read and update MEMORY.md with important shared knowledge, decisions, or lessons learned.
6. Produce EXACTLY the deliverables listed in the Output section — no more, no less
7. Verify all acceptance criteria are met before finishing
8. Write a report to ${REPORTS_DIR}/task-${task_id}.md:
   - What was done
   - Files changed/created (with full paths)
   - Acceptance criteria checklist (each criterion: PASS/FAIL)
   - Status: SUCCESS or FAILED

Make all decisions autonomously. Do not ask for confirmation.
On the very last line of your output, write exactly one of:
TASK_STATUS: SUCCESS
TASK_STATUS: FAILED: <reason>
EOF
  if [[ "$MODE" == "--dry-run" ]]; then
    warn "[DRY RUN] Team: ${TEAM}"
    warn "[DRY RUN] Agents dir: ${AGENTS_DIR}"
    if $USE_BRANCH; then
      warn "[DRY RUN] Branch: ${branch_name}"
    fi
    warn "[DRY RUN] Task: ${task_id} (${task_type}) — ${task_desc}"
    mark_status "$task_id" "~" "x"
    return 0
  fi
  show_progress_bar "$task_id" "$task_desc" "${CURRENT_TASK_NUM:-1}" "${TOTAL_TASKS:-?}"
  local attempt=0
  local response=""
  local success=false
  while [[ $attempt -le $RETRY_LIMIT ]]; do
    if [[ $attempt -gt 0 ]]; then
      local backoff=$(( 10 * 2**(attempt-1) ))
      warn "Retrying task #${task_id} in ${backoff}s (attempt ${attempt}/${RETRY_LIMIT})..."
      sleep $backoff
    fi
    local perm_mode="default"
    if [[ "$TEAM" == "software development" || "$TEAM" == "localization" ]]; then
      perm_mode="team-lead"
    fi
    local claude_args=(-p "$prompt" --max-turns "$MAX_TURNS" --output-format json --allowedTools "Read,Write,Edit,Bash,Glob,Grep,Task,Teammate" --permission-mode "$perm_mode")
    if [[ "$agents" == *"qa"* ]]; then
      claude_args+=(--max-output-tokens 4096)
    fi
    # Export for audit hooks
    export ROLE="team-lead"
    export AGENT="${TEAM}-lead"
    local current_session
    current_session=$(cat "${SESSIONS_DIR}/task-${task_id}.session" 2>/dev/null || echo "")
    local resuming=false
    if [[ -n "$current_session" ]] && ! $FORCE_RESTART; then
      # Only resume if task is not done/failed
      local task_status
      task_status=$(grep "id:${task_id} " "$ROADMAP" | grep -oE '\[.\]' | tr -d '[]' || echo " ")
      if [[ "$task_status" != "x" && "$task_status" != "!" ]]; then
        log "Resuming session ${BLUE}${current_session}${NC} for task #${task_id}..."
        claude_args+=(--resume "$current_session")
        resuming=true
      fi
    fi

    if [[ -z "$SPINNER_PID" ]]; then
       show_progress_bar "$task_id" "$task_desc" "${CURRENT_TASK_NUM:-1}" "${TOTAL_TASKS:-?}"
    fi

    # Run claude, catching potential session errors if resuming
    local run_status=0
    response=$(run_claude "${claude_args[@]}" 2>"$log_file") || run_status=$?

    if [[ $run_status -ne 0 ]] && $resuming; then
      warn "Session ${current_session} is invalid or expired. Falling back to a new session."
      # Remove invalid session arg and try again once
      local new_args=()
      for arg in "${claude_args[@]}"; do
        if [[ "$arg" == "--resume" ]] || [[ "$arg" == "$current_session" ]]; then continue; fi
        new_args+=("$arg")
      done
      response=$(run_claude "${new_args[@]}" 2>"$log_file") || run_status=$?
      rm -f "${SESSIONS_DIR}/task-${task_id}.session"
    fi

    if [[ $run_status -eq 0 ]]; then
      local result
      result=$(echo "$response" | jq -r '.result // empty' 2>/dev/null || echo "$response")
      echo "$response" | jq -r '.session_id // empty' 2>/dev/null > "${SESSIONS_DIR}/task-${task_id}.session"
      local usage
      usage=$(echo "$response" | jq -r '.usage // empty' 2>/dev/null)
      if [[ -n "$usage" ]]; then
        local input output model
        input=$(echo "$usage" | jq -r '.input_tokens // 0')
        output=$(echo "$usage" | jq -r '.output_tokens // 0')
        model=$(echo "$response" | jq -r '.model // "claude-3-5-sonnet-20241022"')
        local cost
        cost=$(calculate_cost "$model" "$input" "$output")
        update_cost "$task_id" "$cost"
        log "Task cost: ${YELLOW}\$${cost}${NC} (Cumulative: ${YELLOW}\$$(get_cumulative_cost)${NC})"
      fi
      local report_file="${REPORTS_DIR}/task-${task_id}.md"
      local is_success=false
      if echo "$result" | grep -q "TASK_STATUS: SUCCESS"; then
        is_success=true
      elif [[ -f "$report_file" ]] && grep -q "Status: SUCCESS" "$report_file"; then
        is_success=true
      fi
      if $is_success; then
        stop_progress_bar
        if $USE_BRANCH && [[ -n "$original_branch" ]]; then
          log "Committing changes and creating PR..."
          git add .
          git commit -m "feat(task): #${task_id} - ${task_desc}" || true
          log "Pushing branch ${BLUE}${branch_name}${NC}..."
          git push -u origin "$branch_name" || warn "Failed to push branch (git push failed)"
          gh pr create --title "feat: #${task_id} - ${task_desc}" --body "Automated PR for task #${task_id}" || warn "Failed to create PR (gh pr create failed)"
          git checkout "$original_branch"
          original_branch=""
        fi
        local elapsed=$(( $(date +%s) - TASK_START_TIME ))
        local elapsed_fmt
        elapsed_fmt=$(format_duration $elapsed)
        ok "Task #${task_id} completed ${CYAN}(${elapsed_fmt})${NC}"
        mark_status "$task_id" "~" "x"
        return 0
      elif echo "$result" | grep -q "TASK_STATUS: PENDING_APPROVAL"; then
        stop_progress_bar
        notify_review
        echo -e "\n${YELLOW}══ PLAN PENDING APPROVAL ══════════════════════════════════════${NC}"
        echo -e "Task #${task_id} plan is ready for review."
        echo -e "Check the logs/output above."
        echo -en "${CYAN}Approve plan and continue? (y/n): ${NC}"
        read -r choice
        if [[ "$choice" =~ ^[Yy]$ ]]; then
          ok "Plan approved. Continuing task #${task_id}..."
          prompt="User has approved the plan. Proceed with implementation and all remaining phases to complete the task."
          attempt=$((attempt))
          continue
        else
          warn "Plan rejected. Marking task as failed."
          reason="Plan rejected by user"
        fi
      elif echo "$result" | grep -q "TASK_STATUS: HUMAN_REVIEW_NEEDED"; then
        stop_progress_bar
        notify_review
        echo -e "\n${YELLOW}══ HUMAN REVIEW NEEDED ════════════════════════════════════════${NC}"
        echo -e "Task #${task_id} requested a human review."
        echo -e "Check the logs/output or specific review files mentioned."
        echo -en "${CYAN}Approve and continue? (y/n): ${NC}"
        read -r choice
        if [[ "$choice" =~ ^[Yy]$ ]]; then
          ok "Review approved. Continuing task #${task_id}..."
          prompt="User has approved the human review. Continue with the next steps."
          attempt=$((attempt))
          continue
        else
          warn "Review rejected. Marking task as failed."
          reason="Human review rejected by user"
        fi
      else
        local reason
        reason=$(echo "$result" | grep "TASK_STATUS: FAILED:" | sed 's/TASK_STATUS: FAILED: //' || echo "unknown")
        if [[ -f "$report_file" ]] && grep -q "Status: FAILED" "$report_file"; then
          reason=$(grep "Status: FAILED" "$report_file" | head -1 | sed 's/.*Status: FAILED[: ]*//' || echo "unknown")
        fi
        warn "Task #${task_id} failed: ${reason}"
      fi
    else
      local elapsed=$(( $(date +%s) - TASK_START_TIME ))
      local elapsed_fmt
      elapsed_fmt=$(format_duration $elapsed)
      warn "Task #${task_id}: Claude Code returned an error ${CYAN}(${elapsed_fmt})${NC} (see ${log_file})"
    fi
    attempt=$((attempt + 1))
  done
  stop_progress_bar
  if [[ -n "$original_branch" ]]; then
    warn "Returning to branch ${BLUE}${original_branch}${NC} after task failure..."
    git checkout "$original_branch"
  fi
  mark_status "$task_id" "~" "!"
  awk -v id="$task_id" -v reason="${reason:-unknown error}" '
    BEGIN { done=0 }
    !done && $0 ~ "^- \\[!\\] id:" id " " {
      $0 = $0 " [FAILED: " reason "]"
      done=1
    }
    { print }
  ' "$ROADMAP" > "${ROADMAP}.tmp" && mv "${ROADMAP}.tmp" "$ROADMAP"
  return 1
}

main() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --help)
        echo "Usage: ./scripts/run.sh [options]"
        echo ""
        echo "Options:"
        echo "  --all            Run all tasks in sequence"
        echo "  --dry-run        Preview without executing"
        echo "  --resume ID      Resume from task ID"
        echo "  --force-restart  Ignore existing sessions and start fresh"
        echo "  --budget USD     Set budget limit"
        echo "  --retry-limit N  Retry failed tasks N times"
        echo "  --approve-plan   Wait for human approval of plans"
        echo "  --team NAME      Specify team name (default: software development)"
        echo "  --branch         Enable feature-branch & PR workflow (requires GH_TOKEN)"
        exit 0
        ;;
      --all)          RUN_ALL=true; shift ;;
      --dry-run)      DRY_RUN=true; shift ;;
      --resume)       RESUME_ID="$2"; shift 2 ;;
      --retry-limit)  RETRY_LIMIT="$2"; shift 2 ;;
      --budget)       BUDGET="$2"; shift 2 ;;
      --approve-plan) APPROVE_PLAN=true; shift ;;
      --team)         TEAM="$2"; shift 2 ;;
      --branch)       USE_BRANCH=true; shift ;;
      --no-branch)    USE_BRANCH=false; shift ;;
      --force-restart) FORCE_RESTART=true; shift ;;
      --plan)         PLAN_FIRST=true; shift ;;
      *) err "Unknown option: $1" ;;
    esac
  done

  configure_provider

  # Switch to team-specific configuration if available
  if [[ -f "agents/${TEAM}/claude/settings.json" ]]; then
    log "Applying team-specific settings for ${BLUE}${TEAM}${NC}..."
    mkdir -p .claude
    cp "agents/${TEAM}/claude/settings.json" ".claude/settings.json"
  elif [[ -f "claude/settings.json" ]]; then
    # Fallback to general settings if team-specific not found
    mkdir -p .claude
    cp "claude/settings.json" ".claude/settings.json"
  fi

  # Automatically enable autoMode if human review (plan approval) is not required
  if command -v jq >/dev/null 2>&1; then
    local tmp_settings
    tmp_settings=$(mktemp)
    if [[ "$APPROVE_PLAN" == "false" ]]; then
      log "Auto mode: ${GREEN}enabled${NC} (no plan approval requested)"
      jq '.permissions.defaultMode = "auto"' ".claude/settings.json" > "$tmp_settings" && mv "$tmp_settings" ".claude/settings.json"
    else
      log "Auto mode: ${YELLOW}manual${NC} (plan approval requested)"
      jq '.permissions.defaultMode = "manual"' ".claude/settings.json" > "$tmp_settings" && mv "$tmp_settings" ".claude/settings.json"
    fi
  else
    warn "jq not found; skipping automatic autoMode configuration"
  fi

  AGENTS_DIR="./agents/${TEAM}"
  if [[ ! -d "$AGENTS_DIR" ]]; then
    # Auto-detect team if only one exists in agents/
    local available_teams
    available_teams=$(ls -1 ./agents/ 2>/dev/null | grep -v "^\." || true)
    local team_count
    team_count=$(echo "$available_teams" | grep -c "." || echo 0)

    if [[ "$team_count" -eq 1 ]]; then
      TEAM=$(echo "$available_teams" | xargs)
      AGENTS_DIR="./agents/${TEAM}"
      log "Auto-detected team: ${BLUE}${TEAM}${NC}"
    else
      echo "Unknown team: $TEAM"
      echo "Available: $(ls ./agents/ 2>/dev/null | xargs || echo "none")"
      exit 1
    fi
  fi

  MODE=""
  if $DRY_RUN; then MODE="--dry-run"; elif $RUN_ALL; then MODE="--all"; fi
  mkdir -p "$LOG_DIR" "$REPORTS_DIR" "$SESSIONS_DIR"

  print_header
  [[ ! -f "$ROADMAP" ]] && err "${ROADMAP} not found"

  if $PLAN_FIRST; then
    log "Planning phase triggered by ${BLUE}--plan${NC}..."
    if ! bash "$(dirname "$0")/plan.sh" "$ROADMAP"; then
      err "Planning failed. Aborting execution."
    fi
    # After planning, we should use tasks/plan.md if it was created
    if [[ -f "tasks/plan.md" ]]; then
      ROADMAP="tasks/plan.md"
      log "Using generated plan: ${BLUE}${ROADMAP}${NC}"
    fi
  fi

  validate_roadmap

  if [[ "$MODE" == "--all" || "$MODE" == "--dry-run" ]]; then
    local counts
    counts=$(count_tasks)
    TOTAL_TASKS=${counts##*|}
    CURRENT_TASK_NUM=0
    if [[ "$MODE" == "--dry-run" ]]; then
      warn "[DRY RUN] Tasks found: ${TOTAL_TASKS}"
    fi
    print_dashboard
    local run_total=0 passed=0 failed=0
    local run_start
    run_start=$(date +%s)
    local found_resume=false
    if [[ -z "$RESUME_ID" ]]; then found_resume=true; fi
    while true; do
      if $STOP_REQUESTED; then
        warn "Stopped by user after ${run_total} tasks"
        break
      fi
      local pick_status=0
      task_line=$(pick_next_task 2>/dev/null) || pick_status=$?
      if [[ $pick_status -eq 2 ]]; then
        warn "All remaining tasks are blocked by unmet or failed dependencies"
        break
      elif [[ $pick_status -eq 1 ]]; then
        break
      fi
      if ! $found_resume; then
        local tid
        tid=$(get_task_id "$task_line")
        if [[ "$tid" == "$RESUME_ID" ]]; then
          found_resume=true
          log "Resuming from task #${tid}"
        else
          log "Skipping task #${tid} (resume target is #${RESUME_ID})"
          mark_status "$tid" " " "x"
          continue
        fi
      fi
      run_total=$((run_total + 1))
      CURRENT_TASK_NUM=$((CURRENT_TASK_NUM + 1))
      if run_task "$task_line"; then
        passed=$((passed + 1))
      else
        failed=$((failed + 1))
        warn "Continuing with next task..."
      fi
      sleep 2
    done
    stop_progress_bar
    local run_elapsed=$(( $(date +%s) - run_start ))
    local run_elapsed_fmt
    run_elapsed_fmt=$(format_duration $run_elapsed)
    echo ""
    print_dashboard
    log "Loop finished in ${CYAN}${run_elapsed_fmt}${NC}: ${GREEN}${passed} done${NC}, ${RED}${failed} failed${NC}, ${run_total} executed"
  else
    if [[ -n "$RESUME_ID" ]]; then
      task_line=$(get_roadmap_tasks | grep "id:$RESUME_ID " | head -n 1)
      [[ -z "$task_line" ]] && err "Task #$RESUME_ID not found in ${ROADMAP}"
    else
      task_line=$(pick_next_task 2>/dev/null) || { ok "All tasks in ROADMAP.md are done!"; exit 0; }
    fi
    run_task "$task_line"
  fi
}

if [[ "${BASH_SOURCE[0]}" == "${0}" ]]; then
  main "$@"
fi
