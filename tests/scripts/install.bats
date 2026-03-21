setup() {
    mkdir -p test_install/agents/software
    mkdir -p test_install/agents/localization
    mkdir -p test_install/scripts
    mkdir -p test_install/claude
    echo "sw-architect" > test_install/agents/software/sw-architect.md
    echo "loc-architect" > test_install/agents/localization/loc-architect.md
    echo "script" > test_install/scripts/run.sh
    echo "script" > test_install/scripts/_common.sh
    echo "{}" > test_install/claude/settings.json
    touch test_install/.env.example

    mkdir -p target_dir
}

teardown() {
    rm -rf test_install
    rm -rf target_dir
}

@test "install.sh creates directories and copies files" {
    # Run from root, targeting target_dir
    SOURCE_DIR=$(pwd)/test_install
    cd target_dir
    SOURCE_DIR=$SOURCE_DIR bash ../install.sh
    [ -d ".claude/agents" ]
    [ -d ".claude-loop/logs" ]
    [ -d "scripts/claude-team" ]
    [ -f ".claude/agents/sw-architect.md" ]
    [ -f "scripts/claude-team/run.sh" ]
    [ -f ".claude/settings.json" ]
    [ -f ".env" ]
    [ -f "ROADMAP.md" ]
}
