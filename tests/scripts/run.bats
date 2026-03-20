setup() {
    # Create temporary ROADMAP.md
    cat <<EOF > ROADMAP.md
# Roadmap
\`\`\`
- [ ] id:001 priority:high type:feature agents:architect,developer Implement login API
- [ ] id:002 priority:medium type:feature depends:001 Implement profile API
\`\`\`
EOF
}

teardown() {
    rm -f ROADMAP.md
    rm -f ROADMAP.md.tmp
}

@test "run.sh --dry-run prints correct output" {
    run bash scripts/run.sh --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"[DRY RUN] Tasks found: 2"* ]]
    [[ "$output" == *"[DRY RUN] Team: software development"* ]]
    [[ "$output" == *"[DRY RUN] Task: 001 (feature) — Implement login API"* ]]
}

@test "run.sh internal logic" {
    cat <<'EOF' > test_run_internal.sh
source scripts/run.sh
ROADMAP=ROADMAP.md
CYAN='' NC='' BLUE='' RED='' GREEN='' YELLOW=''
log() { :; }
ok() { :; }
if ! declare -f calculate_cost > /dev/null; then
  calculate_cost() { echo "0.0"; }
fi

# Test pick_next_task
next=$(pick_next_task)
if [[ "$next" != *"id:001"* ]]; then
  exit 1
fi

mark_status "001" " " "x"
next=$(pick_next_task)
if [[ "$next" != *"id:002"* ]]; then
  exit 2
fi

validate_roadmap || exit 3
exit 0
EOF
    run bash test_run_internal.sh
    [ "$status" -eq 0 ]
    rm test_run_internal.sh
}

@test "run.sh skipped tasks on failed dependencies" {
    cat <<'EOF' > test_run_failed_dep.sh
source scripts/run.sh
ROADMAP=ROADMAP.md
CYAN='' NC='' BLUE='' RED='' GREEN='' YELLOW=''
log() { :; }
if ! declare -f calculate_cost > /dev/null; then
  calculate_cost() { echo "0.0"; }
fi

mark_status "001" " " "!"
pick_next_task
exit $?
EOF
    run bash test_run_failed_dep.sh
    # Returns 1 if no tasks can be run (even if some are blocked by failures)
    [ "$status" -eq 1 ]
    rm test_run_failed_dep.sh
}

@test "run.sh help" {
    run bash scripts/run.sh --help
    [[ "$output" == *"Usage:"* ]]
}
