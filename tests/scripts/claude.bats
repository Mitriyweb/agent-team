setup() {
    mkdir -p test_bin
    cat <<'EOF' > test_bin/claude
echo "MOCKED CLAUDE $*"
EOF
    chmod +x test_bin/claude
    export PATH=$(pwd)/test_bin:$PATH
}

teardown() {
    rm -rf test_bin
}

@test "claude.sh passes arguments" {
    run bash scripts/claude.sh -p "hello"
    [[ "$output" == *"MOCKED CLAUDE -p hello"* ]]
}
