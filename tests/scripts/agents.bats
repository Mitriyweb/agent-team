setup() {
    TEST_DIR="$(mktemp -d)"
    mkdir -p "$TEST_DIR/bin"
    cat <<'EOF' > "$TEST_DIR/bin/claude"
echo '{"result": "SUCCESS"}'
EOF
    chmod +x "$TEST_DIR/bin/claude"
    export PATH="$TEST_DIR/bin:$PATH"
}

teardown() {
    rm -rf "$TEST_DIR"
}

@test "agents.sh local launches local agent" {
    # We only test if it correctly calls start_local which logs a message
    run bash scripts/agents.sh local
    [[ "$output" == *"Starting lead agent [LOCAL: qwen3-coder]"* ]]
}

@test "agents.sh cloud launches cloud agent" {
    # Provide .env and mock log so it matches exactly
    echo "PROVIDER=oauth" > .env
    run bash scripts/agents.sh start
    [[ "$output" == *"OAuth"* ]]
    [[ "$output" == *"Starting lead agent [CLOUD: claude-sonnet]"* ]]
    rm -f .env
}

@test "agents.sh shows usage on unknown command" {
    run bash scripts/agents.sh unknown
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage:"* ]]
}
