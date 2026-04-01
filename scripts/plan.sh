#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  plan.sh — Team-lead reads ROADMAP.md and creates task breakdown
#
#  Usage:
#    ./scripts/plan.sh                — plan from ROADMAP.md
#    ./scripts/plan.sh my-task.md     — plan from custom file
#
#  Output: tasks/plan.md (structured task breakdown)
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

source "$(dirname "$0")/_common.sh"
configure_provider

if [[ "${1:-}" == "--help" ]]; then
    echo "Usage: ./scripts/plan.sh [INPUT_FILE]"
    echo ""
    echo "Options:"
    echo "  --help    Show this message"
    echo ""
    echo "Arguments:"
    echo "  INPUT_FILE    Path to the roadmap file (default: ROADMAP.md)"
    exit 0
fi

INPUT_FILE="${1:-ROADMAP.md}"
TASKS_DIR="tasks"
PLAN_FILE="${TASKS_DIR}/plan.md"

[[ ! -f "$INPUT_FILE" ]] && err "Input file not found: ${INPUT_FILE}"

mkdir -p "$TASKS_DIR"

log "Team-lead analyzing ${BLUE}${INPUT_FILE}${NC}..."

ROADMAP_CONTENT=$(cat "$INPUT_FILE")

read -r -d '' PROMPT <<'PROMPT_EOF' || true
You are the team-lead of an autonomous development team.

Read the task description below and create a structured execution plan.

## Instructions

1. Read the task description VERY carefully — understand the EXACT deliverables requested
2. Identify the FINAL deliverables — files, folders, artifacts the user expects at the end
3. Work BACKWARDS from deliverables to determine what tasks are needed
4. Minimize intermediate artifacts — every task should directly contribute to a final deliverable
5. Assign agents to each task: architect, developer, reviewer, qa
6. Define dependencies between tasks
7. Write the plan to the file specified below

## Critical planning rules

### Deliverable fidelity
- The plan MUST produce EXACTLY the deliverables described in the task — no more, no less
- Do NOT add intermediate "analysis documents" or "synthesis reports" unless the task explicitly asks for them
- If the task says "create specs/ folder with X files" — that's the deliverable, not an analysis doc ABOUT those files
- Every task output must be a file or artifact that either IS a final deliverable or is consumed by a task that produces one

### Minimal decomposition
- Prefer FEWER tasks with clear deliverables over many small tasks with intermediate artifacts
- Research/analysis should be INTERNAL to the task that produces the deliverable, not a separate task
- A task like "analyze X then write spec" should be ONE task, not "Task 1: analyze X → doc, Task 2: read doc → write spec"
- Only split into separate tasks when there is a genuine reason (different agents needed, independent work streams, explicit phasing in the task description)

### Dependency chains
- Avoid long dependency chains (A → B → C → D → E) — they are fragile
- Prefer parallel tasks where possible
- If the task description has phases, respect them, but don't add extra phases

### Preserve original requirements
- Copy acceptance criteria, rules, and quality requirements VERBATIM from the task description into the detailed specs
- Do NOT rephrase, summarize, or lose requirements — the executing agent will ONLY see the plan, not the original ROADMAP
- Include ALL context the agent needs: file paths, naming conventions, format requirements, constraints

## Output format

Write the plan in TWO sections:

### Section 1: Structured tasks for run.sh

Each task on one line inside a code block, format:
```
- [ ] id:N priority:high|medium|low type:feature|research|refactor agents:agent1,agent2 Description of what to do
```

Use `depends:N,M` for task dependencies.

### Section 2: Detailed spec per task

For each task id, write a detailed spec block that contains EVERYTHING the executing agent needs:

```
### Task #N — Title

**Agents:** architect, developer
**Depends on:** #M
**Input:** what the agent receives (specific paths, files, prior task outputs)
**Output:** EXACT files/artifacts to produce (full paths)
**Acceptance criteria:**
- criterion 1 (copied verbatim from task description where applicable)
- criterion 2

**Details:**
Complete instructions for the agent. Include:
- Specific paths to scan/read
- Exact file names and structure to produce
- Quality requirements and constraints from the original task
- Rules and conventions to follow
```

## Additional rules

- Tasks must be ordered by dependency and priority
- Each task should be completable by the assigned agents independently
- Include a final review/QA task
- Do NOT invent requirements — only decompose what's described
- If something is ambiguous, note it explicitly
- The plan must be SELF-CONTAINED — an agent reading only the plan should be able to execute without the original ROADMAP

## Task description

PROMPT_EOF

FULL_PROMPT="${PROMPT}

${ROADMAP_CONTENT}

---

Write the full plan to: ${PLAN_FILE}
After writing, output: PLAN_READY"

# ── Progress spinner ──────────────────────────────────────────────
SPINNER_PID=""
plan_start=$(date +%s)

start_spinner() {
  (
    local frames=('⠋' '⠙' '⠹' '⠸' '⠼' '⠴' '⠦' '⠧' '⠇' '⠏')
    local i=0
    while true; do
      local elapsed=$(( $(date +%s) - plan_start ))
      local mins=$((elapsed / 60)) secs=$((elapsed % 60))
      printf "\r\033[K%b" "${frames[$i]} ${CYAN}Planning...${NC} ${YELLOW}${mins}m ${secs}s${NC}" >&2
      i=$(( (i + 1) % ${#frames[@]} ))
      sleep 1
    done
  ) &
  SPINNER_PID=$!
}

stop_spinner() {
  if [[ -n "$SPINNER_PID" ]] && kill -0 "$SPINNER_PID" 2>/dev/null; then
    kill "$SPINNER_PID" 2>/dev/null
    wait "$SPINNER_PID" 2>/dev/null || true
    SPINNER_PID=""
    printf "\r\033[K" >&2
  fi
}

trap 'stop_spinner; echo ""; warn "Interrupted"; exit 1' SIGINT SIGTERM

start_spinner

if response=$(run_claude -p "$FULL_PROMPT" \
    --max-turns 30 \
    --output-format json \
    --allowedTools "Read,Write,Edit,Glob,Grep,Bash" \
    2>"${TASKS_DIR}/plan.log"); then

  stop_spinner
  plan_elapsed=$(( $(date +%s) - plan_start ))
  plan_mins=$((plan_elapsed / 60)) plan_secs=$((plan_elapsed % 60))

  result=$(echo "$response" | jq -r '.result // empty' 2>/dev/null || echo "$response")

  if echo "$result" | grep -q "PLAN_READY"; then
    ok "Plan created in ${CYAN}${plan_mins}m ${plan_secs}s${NC}: ${PLAN_FILE}"

    # Show task summary
    if [[ -f "$PLAN_FILE" ]]; then
      task_count=$(grep -cE '^\- \[ \] id:[0-9]+' "$PLAN_FILE" 2>/dev/null || echo 0)
      echo ""
      echo -e "  ${CYAN}Tasks:${NC} ${task_count}"
      echo -e "  ${CYAN}File:${NC}  ${PLAN_FILE}"
      echo ""
      # Show task list preview
      grep -E '^\- \[ \] id:[0-9]+' "$PLAN_FILE" | while IFS= read -r line; do
        tid=$(echo "$line" | grep -oE 'id:[0-9]+' | sed 's/id://')
        tpri=$(echo "$line" | grep -oE 'priority:[a-z]+' | sed 's/priority://')
        tdesc=$(echo "$line" | sed 's/^.*priority:[a-z]*//' | sed 's/ type:[a-z]*//' | sed 's/ depends:[0-9,]*//' | sed 's/ agents:[a-z,\-]*//' | xargs)
        pri_color="$NC"
        case "$tpri" in
          high) pri_color="$RED" ;;
          medium) pri_color="$YELLOW" ;;
          low) pri_color="$GREEN" ;;
        esac
        echo -e "  ${BLUE}#${tid}${NC} ${pri_color}[${tpri}]${NC} ${tdesc}"
      done
      echo ""
    fi

    log "Next steps:"
    echo "  1. Review: cat ${PLAN_FILE}"
    echo "  2. Execute: ./scripts/run.sh --all"
    echo ""
  else
    warn "Team-lead finished but PLAN_READY not confirmed. Check ${PLAN_FILE}"
  fi
else
  stop_spinner
  err "Planning failed. See ${TASKS_DIR}/plan.log"
fi
