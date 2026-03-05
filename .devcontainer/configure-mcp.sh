#!/bin/bash
# Auto-configure MCP in Codespace (stdio mode — vault must be accessible inside container)
# Runs automatically via postCreateCommand in devcontainer.json

if [[ -z "$OBSIDIAN_VAULT" ]]; then
  echo ""
  echo "⚠  OBSIDIAN_VAULT is not set — MCP not configured."
  echo "   Options:"
  echo "   A) Set OBSIDIAN_VAULT as a Codespace secret (Settings → Codespaces → Secrets)"
  echo "      then rebuild the container."
  echo "   B) If your vault is tunnelled from a local machine, run:"
  echo "      setup-obsidian <tunnel-url>   (if dotfiles are installed)"
  echo "      curl -s <tunnel-url>/setup.sh | bash"
  echo ""
  exit 0
fi

echo "Configuring Obsidian MCP (stdio, vault: $OBSIDIAN_VAULT)..."
claude mcp remove obsidian 2>/dev/null || true
claude mcp add obsidian \
  --env "OBSIDIAN_VAULT=$OBSIDIAN_VAULT" \
  -- node /workspaces/obsidian-ai-mcp/dist/index.js

echo "✓ Obsidian MCP configured (stdio mode)"
