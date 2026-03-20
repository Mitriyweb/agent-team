setup() {
    mkdir -p test_project
    cd test_project
}

teardown() {
    cd ..
    rm -rf test_project
}

@test "test.sh detects npm test" {
    cat <<EOF > package.json
{
  "scripts": {
    "test": "echo 'running tests'"
  }
}
EOF
    run bash ../scripts/test.sh
    [[ "$output" == *"→ npm test"* ]]
}

@test "test.sh detects vitest" {
    touch vitest.config.ts
    mkdir -p node_modules/.bin
    echo "#!/bin/bash" > node_modules/.bin/vitest
    echo "echo 'vitest run'" >> node_modules/.bin/vitest
    chmod +x node_modules/.bin/vitest
    PATH=$PATH:$(pwd)/node_modules/.bin run bash ../scripts/test.sh
    [[ "$output" == *"→ Vitest"* ]]
}

@test "test.sh detects jest" {
    touch jest.config.js
    mkdir -p node_modules/.bin
    echo "#!/bin/bash" > node_modules/.bin/jest
    echo "echo 'jest run'" >> node_modules/.bin/jest
    chmod +x node_modules/.bin/jest
    PATH=$PATH:$(pwd)/node_modules/.bin run bash ../scripts/test.sh
    [[ "$output" == *"→ Jest"* ]]
}

@test "test.sh detects pytest" {
    touch pytest.ini
    mkdir -p bin
    echo "#!/bin/bash" > bin/pytest
    echo "echo 'pytest run'" >> bin/pytest
    chmod +x bin/pytest
    PATH=$PATH:$(pwd)/bin run bash ../scripts/test.sh
    [[ "$output" == *"→ Pytest"* ]]
}

@test "test.sh detects go test" {
    touch go.mod
    run bash ../scripts/test.sh
    [[ "$output" == *"→ Go test"* ]]
}
