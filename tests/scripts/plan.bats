setup() {
    export ROADMAP="ROADMAP_TEST.md"
    cat <<EOF > "$ROADMAP"
# Roadmap
\`\`\`
- [ ] id:001 priority:high type:feature agents:architect,developer Implement login API
\`\`\`
EOF
    mkdir -p tasks
}

teardown() {
    rm -f "$ROADMAP"
    rm -rf tasks
}

@test "plan.sh fails on missing input file" {
    run bash scripts/plan.sh NO_ROADMAP.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"Input file not found"* ]]
}

@test "plan.sh calls claude and creates plan" {
    # Mock claude to return PLAN_READY and write a plan file
    mkdir -p bin
    cat <<'EOF' > bin/claude
echo '{"result": "PLAN_READY"}'
cat <<'PLAN' > tasks/plan.md
### Section 1: Structured tasks for run.sh
```
- [ ] id:001 priority:high type:feature agents:architect,developer Implement login API
```
### Section 2: Detailed spec per task
### Task #001 Implement login API
PLAN
EOF
    chmod +x bin/claude
    PATH=$(pwd)/bin:$PATH ROADMAP_FILE="$ROADMAP" run bash scripts/plan.sh "$ROADMAP"
    [ "$status" -eq 0 ]
    [[ "$output" == *"Plan created"* ]]
    [ -f "tasks/plan.md" ]
}
