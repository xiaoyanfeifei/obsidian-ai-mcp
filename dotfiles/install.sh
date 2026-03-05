#!/bin/bash
# Obsidian AI MCP — dotfiles installer
# Add this to your GitHub dotfiles repo (github.com/<you>/dotfiles).
# GitHub Codespaces runs it automatically on every new Codespace.
#
# Setup:
#   1. Copy this file (or its contents) into your dotfiles repo as install.sh
#   2. In GitHub Settings → Codespaces → Dotfiles → enable auto-install
#   3. In every new Codespace, run:  setup-obsidian <tunnel-url>

SHELL_RC="${HOME}/.bashrc"
[[ -f "${HOME}/.zshrc" ]] && SHELL_RC_ZSH="${HOME}/.zshrc"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

# Install /vault slash command
mkdir -p "${HOME}/.claude/commands"
if [[ ! -f "${HOME}/.claude/commands/vault.md" ]]; then
  cp "${SCRIPT_DIR}/.claude/commands/vault.md" "${HOME}/.claude/commands/vault.md"
  echo "Installed /vault command"
else
  echo "/vault command already installed — skipping"
fi

SNIPPET='
# ── Obsidian AI MCP ──────────────────────────────────────────────────────────
# Usage: setup-obsidian https://your-tunnel.trycloudflare.com
setup-obsidian() {
  local url="${1%/}"  # strip trailing slash
  if [[ -z "$url" ]]; then
    echo "Usage: setup-obsidian <tunnel-url>"
    echo "Example: setup-obsidian https://abc-def.trycloudflare.com"
    return 1
  fi
  echo "Configuring Obsidian MCP from $url ..."
  claude mcp remove obsidian 2>/dev/null || true
  claude mcp add --transport http obsidian "${url}/mcp"
  echo ""
  echo "✓ Done — start a new Claude session to use the vault tools."
}

# One-liner alternative: curl -s <tunnel-url>/setup.sh | bash
# ─────────────────────────────────────────────────────────────────────────────
'

add_to_rc() {
  local rc="$1"
  if ! grep -q 'setup-obsidian' "$rc" 2>/dev/null; then
    echo "$SNIPPET" >> "$rc"
    echo "Added setup-obsidian to $rc"
  else
    echo "setup-obsidian already in $rc — skipping"
  fi
}

add_to_rc "$HOME/.bashrc"
[[ -n "$SHELL_RC_ZSH" ]] && add_to_rc "$HOME/.zshrc"

echo ""
echo "✓ Obsidian MCP dotfiles installed."
echo ""
echo "  When your local MCP server is running, configure this Codespace with:"
echo "  setup-obsidian <tunnel-url>"
echo "  or: curl -s <tunnel-url>/setup.sh | bash"
echo ""
