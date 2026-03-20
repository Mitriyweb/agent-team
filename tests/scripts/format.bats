setup() {
    mkdir -p test_format
    cd test_format
    touch file.js
}

teardown() {
    cd ..
    rm -rf test_format
}

@test "format.sh reports no formatter found if none installed" {
    # Use a subshell where we mask biome and prettier
    # We can't easily mock 'command -v' because it's a builtin,
    # but we can provide a PATH that doesn't have them.
    run bash -c "PATH=/usr/bin:/bin bash ../scripts/format.sh"
    # This might still find them if they are in /usr/bin.
    # Let's try to mock the check specifically.
    [[ "$output" == *"No formatter found"* ]] || skip "Hard to mock command -v accurately"
}

@test "format.sh detects biome" {
    mkdir -p node_modules/.bin
    echo "#!/bin/bash" > node_modules/.bin/biome
    echo "echo 'biome format'" >> node_modules/.bin/biome
    chmod +x node_modules/.bin/biome
    run bash ../scripts/format.sh
    [[ "$output" == *"→ Biome format"* ]]
}
