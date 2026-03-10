#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  setup.sh — One-time environment setup
#  Run this once after cloning the repository.
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
ok()   { echo -e "${GREEN}✓${NC} $*"; }
warn() { echo -e "${YELLOW}!${NC} $*"; }
err()  { echo -e "${RED}✗${NC} $*"; exit 1; }

echo ""
echo "  Claude Code Agent Team — Setup"
echo "  ─────────────────────────────────"
echo ""

# ── Claude Code (required) ──────────────────────────────────────
if command -v claude &>/dev/null; then
  ok "Claude Code $(claude --version 2>/dev/null || echo 'installed')"
else
  warn "Claude Code not found — attempting to install..."
  if command -v npm &>/dev/null; then
    npm install -g @anthropic-ai/claude-code
    ok "Claude Code installed via npm"
  elif command -v brew &>/dev/null; then
    brew install claude-code
    ok "Claude Code installed via brew"
  else
    err "Claude Code not found. Install manually: npm install -g @anthropic-ai/claude-code"
  fi
fi

# ── Dev tooling (optional) ──────────────────────────────────────
if command -v bun &>/dev/null; then
  ok "Bun $(bun --version) — installing dev tools (biome, markdownlint, prek)..."
  bun install
  ok "Dev dependencies installed"
elif command -v npm &>/dev/null; then
  echo ""
  echo "  Optional: dev tools (linting, formatting, pre-commit hooks)"
  echo "  Run 'npm install' to install them. Not required for running agents."
  echo ""
else
  warn "bun/npm not found — skipping optional dev tools (biome, markdownlint, prek)"
fi

# ── Docker (optional) ───────────────────────────────────────────
if command -v docker &>/dev/null; then
  ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
else
  warn "Docker not found — required only for local model (Ollama). Skipping."
fi

# ── tmux (optional) ─────────────────────────────────────────────
if command -v tmux &>/dev/null; then
  ok "tmux $(tmux -V)"
else
  warn "tmux not found — required only for split-screen agent view."
fi

# ── .env ────────────────────────────────────────────────────────
if [[ -f ".env" ]]; then
  ok ".env already exists"
elif [[ -f ".env.example" ]]; then
  cp .env.example .env
  warn ".env created from .env.example — add your ANTHROPIC_API_KEY"
else
  echo "ANTHROPIC_API_KEY=" > .env
  warn ".env created — add your ANTHROPIC_API_KEY"
fi

# ── Log directories ─────────────────────────────────────────────
mkdir -p .claude-loop/{logs,reports,sessions}
ok "Log directories created"

# ── Script permissions ──────────────────────────────────────────
chmod +x scripts/*.sh
ok "Script permissions set"

echo ""
echo "  Setup complete. Next steps:"
echo "  1. Add your API key to .env (Anthropic or Azure APIM)"
echo "  2. Add tasks to ROADMAP.md"
echo "  3. Run: ./scripts/run.sh"
echo ""
