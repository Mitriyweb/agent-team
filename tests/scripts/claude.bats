setup() {
    mkdir -p bin
    cat <<'EOF' > bin/claude
echo "MOCKED CLAUDE $*"
EOF
    chmod +x bin/claude
    export PATH=$(pwd)/bin:$PATH
}

teardown() {
    rm -rf bin
}

@test "claude.sh passes arguments" {
    run bash scripts/claude.sh -p "hello"
    [[ "$output" == *"MOCKED CLAUDE -p hello"* ]]
}
