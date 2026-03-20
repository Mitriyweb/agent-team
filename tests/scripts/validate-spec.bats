setup() {
    export SPEC="TEST_SPEC.md"
}

teardown() {
    rm -f TEST_SPEC.md
}

@test "validate-spec.sh fails on missing sections" {
    cat <<EOF > TEST_SPEC.md
# Spec
## Goal
Something
EOF
    run bash scripts/validate-spec.sh TEST_SPEC.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"Missing: Components"* ]]
}

@test "validate-spec.sh passes on all sections" {
    cat <<EOF > TEST_SPEC.md
# Spec
## Goal
## Components
## Interfaces
## File structure
## Risks
EOF
    run bash scripts/validate-spec.sh TEST_SPEC.md
    [ "$status" -eq 0 ]
    [[ "$output" == *"Spec is valid"* ]]
}

@test "validate-spec.sh fails on non-existent file" {
    run bash scripts/validate-spec.sh NO_FILE.md
    [ "$status" -eq 1 ]
    [[ "$output" == *"File not found"* ]]
}
