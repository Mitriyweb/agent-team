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

# ── Bun ───────────────────────────────────────────────────────────
if command -v bun &>/dev/null; then
  ok "Bun $(bun --version)"
else
  err "Bun not found. Install from https://bun.sh: curl -fsSL https://bun.sh/install | bash"
fi

# ── Dependencies + hooks ──────────────────────────────────────────
bun install
ok "Dev dependencies installed (biome, markdownlint-cli2, prek)"

# ── Claude Code ───────────────────────────────────────────────────
if command -v claude &>/dev/null; then
  ok "Claude Code $(claude --version 2>/dev/null || echo 'installed')"
else
  warn "Claude Code not found — installing..."
  bun install -g @anthropic-ai/claude-code
  ok "Claude Code installed"
fi

# ── Docker (optional) ─────────────────────────────────────────────
if command -v docker &>/dev/null; then
  ok "Docker $(docker --version | cut -d' ' -f3 | tr -d ',')"
else
  warn "Docker not found — required only for local model (Ollama). Skipping."
fi

# ── tmux (optional) ───────────────────────────────────────────────
if command -v tmux &>/dev/null; then
  ok "tmux $(tmux -V)"
else
  warn "tmux not found — required only for split-screen agent view. Install: sudo apt install tmux"
fi

# ── .env ──────────────────────────────────────────────────────────
if [[ -f ".env" ]]; then
  ok ".env already exists"
else
  cp .env.example .env
  warn ".env created from .env.example — add your ANTHROPIC_API_KEY"
fi

# ── Log directories ───────────────────────────────────────────────
mkdir -p .claude-loop/{logs,reports,sessions}
ok "Log directories created"

# ── Script permissions ────────────────────────────────────────────
chmod +x scripts/*.sh
ok "Script permissions set"

echo ""
echo "  Setup complete. Next steps:"
echo "  1. Add your ANTHROPIC_API_KEY to .env"
echo "  2. Add tasks to ROADMAP.md"
echo "  3. Run: ./scripts/run.sh"
echo ""
