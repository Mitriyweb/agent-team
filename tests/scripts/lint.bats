setup() {
    mkdir -p test_lint
    cd test_lint
    touch file.md
}

teardown() {
    cd ..
    rm -rf test_lint
}

@test "lint.sh reports no linters found if none installed" {
    # We mock command -v to return false for everything
    run bash -c "command() { return 1; }; export -f command; bash ../scripts/lint.sh"
    [[ "$output" == *"No linters found"* ]]
}

@test "lint.sh detects biome" {
    mkdir -p node_modules/.bin
    echo "echo 'biome check'" > node_modules/.bin/biome
    chmod +x node_modules/.bin/biome
    run bash ../scripts/lint.sh
    [[ "$output" == *"→ Biome"* ]]
}
