setup() {
    # Create temporary ROADMAP.md
    cat <<EOF > ROADMAP.md
# Roadmap
\`\`\`
- [ ] id:001 priority:high type:feature agents:architect,developer Implement login API
\`\`\`
EOF
}

@test "run.sh --dry-run prints correct output" {
    run ./scripts/run.sh --dry-run
    [ "$status" -eq 0 ]
    [[ "$output" == *"[DRY RUN] Tasks found: 1"* ]]
    [[ "$output" == *"[DRY RUN] Team: software development"* ]]
    [[ "$output" == *"[DRY RUN] Task: 001 (feature) — Implement login API"* ]]
    [[ "$output" == *"[DRY RUN] Branch: task/001"* ]]
}

@test "run.sh --no-branch skips branching" {
    run ./scripts/run.sh --dry-run --no-branch
    [ "$status" -eq 0 ]
    [[ "$output" != *"[DRY RUN] Branch:"* ]]
}
