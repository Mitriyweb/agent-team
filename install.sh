#!/bin/bash
# ─────────────────────────────────────────────────────────────────
#  install.sh — One-line installer for agent-team
#
#  Usage: curl -fsSL https://raw.githubusercontent.com/Mitriyweb/agent-team/main/install.sh | bash
# ─────────────────────────────────────────────────────────────────

set -euo pipefail

REPO="Mitriyweb/agent-team"
BIN_DIR="${HOME}/.local/bin"
BIN_NAME="agent-team"

RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
NC='\033[0m'

log() { echo -e "${BLUE}[install]${NC} $1"; }
ok()  { echo -e "${GREEN}✓${NC} $1"; }
err() { echo -e "${RED}✗${NC} $1" >&2; exit 1; }

# Detect platform
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Darwin) PLATFORM="darwin" ;;
  Linux)  PLATFORM="linux" ;;
  *)      err "Unsupported OS: $OS" ;;
esac

case "$ARCH" in
  x86_64|amd64)  ARCH="x64" ;;
  arm64|aarch64) ARCH="arm64" ;;
  *)             err "Unsupported architecture: $ARCH" ;;
esac

ASSET="${BIN_NAME}-${PLATFORM}-${ARCH}"
URL="https://github.com/${REPO}/releases/latest/download/${ASSET}"

log "Detected platform: ${PLATFORM}-${ARCH}"
log "Downloading ${URL}..."

command -v curl >/dev/null 2>&1 || err "curl is required but not found."

mkdir -p "$BIN_DIR"

TMP_FILE="$(mktemp)"
if curl -fsSL "$URL" -o "$TMP_FILE"; then
  chmod 755 "$TMP_FILE"
  mv "$TMP_FILE" "${BIN_DIR}/${BIN_NAME}"
  ok "Installed ${BIN_NAME} to ${BIN_DIR}/${BIN_NAME}"
else
  rm -f "$TMP_FILE"
  err "Download failed. Check https://github.com/${REPO}/releases for available binaries."
fi

# Check PATH
if ! echo "$PATH" | tr ':' '\n' | grep -qx "$BIN_DIR"; then
  log ""
  log "Add to your shell profile:"
  log "  export PATH=\"\$PATH:${BIN_DIR}\""
fi

log ""
log "Run: ${BLUE}${BIN_NAME} init --team frontend${NC} in any project."
