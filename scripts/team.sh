#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  team.sh — Manage agent teams (create, validate)
#
#  Usage:
#    ./scripts/team.sh create --name "NAME" --description "DESC" --roles "ROLE1,ROLE2"
#    ./scripts/team.sh validate "NAME"
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

source "$(dirname "$0")/_common.sh"

TEMPLATE_DIR="$(dirname "$0")/templates"
AGENTS_ROOT="agents"

create_team() {
    local name=""
    local description=""
    local roles_str=""
    
    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name) name="$2"; shift 2 ;;
            --description) description="$2"; shift 2 ;;
            --roles) roles_str="$2"; shift 2 ;;
            *) shift ;;
        esac
    done

    [[ -z "$name" ]] && err "Team name is required (--name)"
    [[ -z "$description" ]] && err "Team description is required (--description)"
    [[ -z "$roles_str" ]] && err "Roles are required (--roles)"

    local team_dir="${AGENTS_ROOT}/${name}"
    mkdir -p "$team_dir"

    # Determine prefix (first few chars of name)
    local prefix=$(echo "$name" | cut -c1-2 | tr '[:upper:]' '[:lower:]')
    [[ -n "$prefix" ]] && prefix="${prefix}-"

    # 1. Create PROTOCOL.md
    local protocol_file="${team_dir}/${prefix}PROTOCOL.md"
    sed "s/{{TEAM_PREFIX}}/${prefix}/g" "${TEMPLATE_DIR}/PROTOCOL.md" > "$protocol_file"
    ok "Created ${protocol_file}"

    # 2. Create agent profiles
    IFS=',' read -ra roles <<< "$roles_str"
    for role in "${roles[@]}"; do
        role=$(echo "$role" | xargs) # trim
        local role_cap=$(echo "$role" | awk '{print toupper(substr($0,1,1)) substr($0,2)}')
        local agent_file="${team_dir}/${prefix}${role}.md"
        sed -e "s/{{AGENT_ROLE}}/${role_cap}/g" \
            -e "s/{{AGENT_DESCRIPTION}}/${description}/g" \
            -e "s/{{TEAM_NAME}}/${name}/g" \
            -e "s/{{PROTOCOL_FILE}}/${prefix}PROTOCOL.md/g" \
            "${TEMPLATE_DIR}/agent.md" > "$agent_file"
        ok "Created ${agent_file}"
    done

    # 3. Create skills dir
    mkdir -p "${team_dir}/skills"
    
    ok "Team '${name}' successfully created in ${team_dir}"
}

validate_team() {
    local name="$1"
    local team_dir="${AGENTS_ROOT}/${name}"

    if [[ ! -d "$team_dir" ]]; then
        err "Team '${name}' not found at ${team_dir}"
    fi

    log "Validating team: ${BLUE}${name}${NC}"
    local errors=0

    # 1. Check for PROTOCOL.md
    if ! ls "${team_dir}"/*PROTOCOL.md &>/dev/null; then
        warn "Missing PROTOCOL.md in ${team_dir}"
        errors=$((errors + 1))
    fi

    # 2. Check for at least one agent profile
    local agent_count=$(ls "${team_dir}"/*.md | grep -v "PROTOCOL.md" | wc -l | tr -d ' ')
    if [[ "$agent_count" -eq 0 ]]; then
        warn "No agent profiles found in ${team_dir}"
        errors=$((errors + 1))
    fi

    # 3. Validate agent files have required sections
    for agent_file in "${team_dir}"/*.md; do
        if [[ "$agent_file" == *"PROTOCOL.md" ]]; then continue; fi
        if ! grep -q "^# " "$agent_file"; then
            warn "Agent file ${agent_file} missing H1 title"
            errors=$((errors + 1))
        fi
        if ! grep -q "^## Instructions" "$agent_file"; then
            warn "Agent file ${agent_file} missing '## Instructions' section"
            errors=$((errors + 1))
        fi
    done

    if [[ $errors -gt 0 ]]; then
        err "Team validation failed with ${errors} error(s)"
    else
        ok "Team '${name}' is valid"
    fi
}

main() {
    if [[ $# -lt 1 ]]; then
        echo "Usage: $0 {create|validate} [options]"
        exit 1
    fi

    local command="$1"
    shift

    case "$command" in
        create) create_team "$@" ;;
        validate) validate_team "$@" ;;
        *) err "Unknown command: $command" ;;
    esac
}

main "$@"
