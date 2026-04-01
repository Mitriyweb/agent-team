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
    local human_review=true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --name) name="$2"; shift 2 ;;
            --description) description="$2"; shift 2 ;;
            --roles) roles_str="$2"; shift 2 ;;
            --no-human-review) human_review=false; shift ;;
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
    if ! $human_review; then
        sed -i '' '/HUMAN_REVIEW/d' "$protocol_file" || sed -i '/HUMAN_REVIEW/d' "$protocol_file"
    fi
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

    # 4. Create claude config dir
    mkdir -p "${team_dir}/claude"
    if [[ -f "claude/settings.json" ]]; then
        cp "claude/settings.json" "${team_dir}/claude/settings.json"
        ok "Copied default claude settings to ${team_dir}/claude/"
    fi
    
    ok "Team '${name}' successfully created in ${team_dir}"
}

init_project() {
    local team_name=""
    local human_review=true

    while [[ $# -gt 0 ]]; do
        case "$1" in
            --team) team_name="$2"; shift 2 ;;
            --no-human-review) human_review=false; shift ;;
            -*) shift ;;
            *)
                # Positional argument: treat as team name
                if [[ -z "$team_name" ]]; then
                    team_name="$1"
                fi
                shift
                ;;
        esac
    done

    log "Initializing agent-team project..."

    # 1. Create directory structure
    mkdir -p agents tasks .agents/workflows

    # 2. Copy core scripts (from SOURCE_DIR)
    # DEPRECATED: We no longer copy bash scripts to the local project.
    # The agent-team CLI handles execution from the package directory.
    local src_dir="${SOURCE_DIR:-.}"

    # 3. Copy templates
    # DEPRECATED: Templates are now used directly from the package directory.

    # 4. Copy workflows
    cp -r "${src_dir}/.agents/workflows/"* ".agents/workflows/"
    ok "Copied workflows to .agents/workflows/"

    # 5. Create default memory and roadmap
    if [[ ! -f "MEMORY.md" ]]; then
        cp "${src_dir}/MEMORY.md" "MEMORY.md" || echo "# Project Memory" > "MEMORY.md"
        ok "Created MEMORY.md"
    fi
    if [[ ! -f "ROADMAP.md" ]]; then
        echo "# Project Roadmap" > "ROADMAP.md"
        ok "Created empty ROADMAP.md"
    fi

    # 6. Copy specified team if requested
    if [[ -n "$team_name" ]]; then
        if [[ -d "${src_dir}/agents/${team_name}" ]]; then
            mkdir -p "agents/${team_name}"
            cp -r "${src_dir}/agents/${team_name}/"* "agents/${team_name}/"
            ok "Initialized team: ${team_name}"
        else
            warn "Team '${team_name}' not found in ${src_dir}/agents/"
        fi
    fi

    # 7. Setup Claude settings
    mkdir -p .claude
    if [[ -n "$team_name" ]] && [[ -f "${src_dir}/agents/${team_name}/claude/settings.json" ]]; then
        cp "${src_dir}/agents/${team_name}/claude/settings.json" ".claude/settings.json"
        ok "Applied team-specific Claude settings for ${team_name}"
    elif [[ -f "${src_dir}/claude/settings.json" ]]; then
        cp "${src_dir}/claude/settings.json" ".claude/settings.json"
        ok "Applied default Claude settings"
    fi

    # 8. Set autoMode if human review is disabled
    if ! $human_review; then
        if command -v jq >/dev/null 2>&1; then
            local tmp_settings=$(mktemp)
            jq '.permissions.defaultMode = "auto"' ".claude/settings.json" > "$tmp_settings" && mv "$tmp_settings" ".claude/settings.json"
            ok "Auto mode: ${GREEN}enabled${NC} (--no-human-review)"
        else
            warn "jq not found; skipping automatic autoMode configuration"
        fi
    fi

    # 9. Post-process: Replace script references with CLI commands in all project documentation
    # This ensures that while the repository uses ./scripts/*.sh, the initialized project uses agent-team commands.
    log "Finalizing project documentation for CLI..."
    find . -maxdepth 3 -type f -name "*.md" | while read -r file; do
        # Only process files in relevant directories to be safe/efficient
        if [[ "$file" == "./agents/"* ]] || [[ "$file" == "./.agents/workflows/"* ]]; then
            sed_inplace -e 's/\.\/scripts\/run\.sh/agent-team run/g' \
                        -e 's/\.\/scripts\/plan\.sh/agent-team plan/g' \
                        -e 's/plan\.sh /agent-team plan /g' \
                        -e 's/run\.sh /agent-team run /g' \
                        -e 's/\`plan\.sh\`/\`agent-team plan\`/g' \
                        -e 's/\`run\.sh\`/\`agent-team run\`/g' \
                        "$file"
        fi
    done

    ok "Project initialized successfully."
    log "Run ${BLUE}agent-team run --plan --all${NC} to start."
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
        init) init_project "$@" ;;
        *) err "Unknown command: $command" ;;
    esac
}

main "$@"
