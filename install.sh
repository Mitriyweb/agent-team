#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  install.sh — One-command installation for Claude Agent Team
#
#  Usage:
#    bash install.sh
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

# NEW: Enable xtrace if COVERAGE is set
if [[ -n "${COVERAGE:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/scripts/_common.sh" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/scripts/_common.sh"
elif [[ -n "${COVERAGE:-}" && -f "$(dirname "${BASH_SOURCE[0]}")/_common.sh" ]]; then
  source "$(dirname "${BASH_SOURCE[0]}")/_common.sh"
fi

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; BLUE='\033[0;34m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; exit 1; }
info() { echo -e "${BLUE}i${NC} $*"; }

echo ""
echo -e "${BLUE}  Claude Code Agent Team — Installer${NC}"
echo "  ───────────────────────────────────"
echo ""

# 1. Detect environment
TARGET_DIR=$(pwd)
SOURCE_DIR="${SOURCE_DIR:-$(dirname "$(readlink -f "$0")")}"

if [[ "$TARGET_DIR" == "$SOURCE_DIR" ]]; then
  info "Running from project root. Installing into current directory..."
else
  info "Installing into: $TARGET_DIR"
fi

# 2. Create directories
info "Creating directories..."
mkdir -p .claude/agents
mkdir -p .claude-loop/{logs,reports,sessions}
mkdir -p scripts/claude-team
ok "Directories created"

# 3. Copy agents
info "Copying agents to .claude/agents/..."
# Fix: Handle space in directory name
if [[ -d "$SOURCE_DIR/agents/software development" ]]; then
  cp "$SOURCE_DIR/agents/software development"/sw-*.md .claude/agents/
elif [[ -d "$SOURCE_DIR/agents/software" ]]; then
  cp "$SOURCE_DIR/agents/software"/sw-*.md .claude/agents/
fi
cp "$SOURCE_DIR"/agents/localization/loc-*.md .claude/agents/

# 3a. Copy agent-specific scripts
if [[ -d "$SOURCE_DIR/agents/software development/scripts" ]]; then
  mkdir -p .claude/agents/scripts
  cp "$SOURCE_DIR/agents/software development/scripts"/*.sh .claude/agents/scripts/
  chmod +x .claude/agents/scripts/*.sh
elif [[ -d "$SOURCE_DIR/agents/software/scripts" ]]; then
  mkdir -p .claude/agents/scripts
  cp "$SOURCE_DIR/agents/software/scripts"/*.sh .claude/agents/scripts/
  chmod +x .claude/agents/scripts/*.sh
fi

ok "Agents installed"

# 4. Copy scripts
info "Copying scripts to scripts/claude-team/..."
cp "$SOURCE_DIR"/scripts/*.sh scripts/claude-team/
chmod +x scripts/claude-team/*.sh
ok "Scripts installed"

# 5. Configuration
info "Setting up configuration..."

# settings.json
if [[ -f ".claude/settings.json" ]]; then
  warn ".claude/settings.json already exists. Skipping overwrite. Please merge manually if needed."
else
  cp "$SOURCE_DIR"/claude/settings.json .claude/settings.json
  ok ".claude/settings.json created"
fi

# .env
if [[ -f ".env" ]]; then
  ok ".env already exists"
else
  cp "$SOURCE_DIR"/.env.example .env
  warn ".env created from .env.example — please add your API key"
fi

# ROADMAP.md
if [[ -f "ROADMAP.md" ]]; then
  ok "ROADMAP.md already exists"
else
  cat > ROADMAP.md <<EOF
# Project Roadmap

\`\`\`markdown
- [ ] id:001 priority:high type:feature agents:sw-team-lead Initial task description
\`\`\`

## Task details

### Task #001 Initial task
Description of the first task.
EOF
  ok "Default ROADMAP.md created"
fi

echo ""
ok "Installation complete!"
echo ""
echo "Next steps:"
echo "1. Edit .env and add your ANTHROPIC_API_KEY"
echo "2. Edit ROADMAP.md to define your tasks"
echo "3. Run agents: ./scripts/claude-team/run.sh"
echo ""
