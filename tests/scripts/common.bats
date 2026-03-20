setup() {
    # Create temporary pricing.yaml for testing
    mkdir -p config
    cat <<EOF > config/pricing.yaml
claude-opus-4-6:
  input_per_token: 0.000015
  output_per_token: 0.000075
claude-sonnet-4-6:
  input_per_token: 0.000003
  output_per_token: 0.000015
EOF
}

teardown() {
    rm -rf config
    rm -f .env
}

@test "calculate_cost for opus-4-6" {
    source scripts/_common.sh
    result=$(calculate_cost "claude-opus-4-6" 1000 1000)
    [ "$result" == "0.09" ]
}

@test "calculate_cost for sonnet-4-6" {
    source scripts/_common.sh
    result=$(calculate_cost "claude-sonnet-4-6" 1000 1000)
    [ "$result" == "0.018" ]
}

@test "calculate_cost with fallback for unknown model" {
    source scripts/_common.sh
    result=$(calculate_cost "unknown" 1000 1000)
    [ "$result" == "0.018" ]
}

@test "configure_provider with oauth" {
    source scripts/_common.sh
    PROVIDER="oauth" run configure_provider
    [[ "$output" == *"OAuth"* ]]
}

@test "configure_provider with anthropic" {
    source scripts/_common.sh
    # Mock err to not exit
    err() { echo "ERR: $*"; }
    # Should fail if API key is missing
    ANTHROPIC_API_KEY="" PROVIDER="anthropic" run configure_provider
    [[ "$output" == *"ANTHROPIC_API_KEY not set"* ]]

    # Should pass if API key is set
    ANTHROPIC_API_KEY="test-key" PROVIDER="anthropic" run configure_provider
    [[ "$output" == *"Anthropic"* ]]
}

@test "configure_provider with azure-apim" {
    # Test setting variables
    run bash -c "source scripts/_common.sh; AZURE_APIM_ENDPOINT='http://test.com' AZURE_APIM_KEY='test-key' PROVIDER='azure-apim' configure_provider > /dev/null; echo \$ANTHROPIC_BASE_URL; echo \$ANTHROPIC_AUTH_TOKEN"
    [[ "$output" == *"http://test.com"* ]]
    [[ "$output" == *"test-key"* ]]
}

@test "configure_provider with litellm" {
    run bash -c "source scripts/_common.sh; LITELLM_HOST='http://local:8080' PROVIDER='litellm' configure_provider > /dev/null; echo \$ANTHROPIC_BASE_URL"
    [[ "$output" == *"http://local:8080"* ]]
}

@test "sed_inplace helper" {
    echo "hello world" > test_file.txt
    source scripts/_common.sh
    sed_inplace 's/hello/hi/' test_file.txt
    [ "$(cat test_file.txt)" == "hi world" ]
    rm test_file.txt
}
