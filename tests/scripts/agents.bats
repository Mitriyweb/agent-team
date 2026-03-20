setup() {
    mkdir -p bin
    cat <<'EOF' > bin/claude
echo '{"result": "SUCCESS"}'
EOF
    chmod +x bin/claude
    export PATH=$(pwd)/bin:$PATH
}

teardown() {
    rm -rf bin
}

@test "agents.sh local launches local agent" {
    # We only test if it correctly calls start_local which logs a message
    run bash scripts/agents.sh local
    [[ "$output" == *"Starting agent [LOCAL: qwen3-coder]"* ]]
}

@test "agents.sh cloud launches cloud agent" {
    # Provide .env and mock log so it matches exactly
    echo "PROVIDER=oauth" > .env
    run bash scripts/agents.sh cloud
    [[ "$output" == *"OAuth"* ]]
    [[ "$output" == *"Starting agent [CLOUD: claude-sonnet]"* ]]
    rm -f .env
}

@test "agents.sh shows usage on unknown command" {
    run bash scripts/agents.sh unknown
    [ "$status" -eq 1 ]
    [[ "$output" == *"Usage:"* ]]
}
