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
