#!/bin/bash
# obsidian-ai-mcp — switch vault (macOS / Linux)
# Updates OBSIDIAN_VAULT in your shell profile and ~/.claude.json.
# Scaffolds Inbox/, Notes/, and starter files if the new vault doesn't have them yet.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/switch-vault.sh | bash
# Or if you already have it:
#   bash switch-vault.sh

set -e

# When piped via curl | bash, stdin is the pipe so interactive read doesn't work.
# Detect this and re-exec from a temp file so stdin is the terminal.
if [ ! -t 0 ]; then
  TMP=$(mktemp /tmp/obsidian-switch-XXXXXX.sh)
  curl -fsSL "https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/switch-vault.sh" -o "$TMP"
  bash "$TMP"
  rm -f "$TMP"
  exit
fi

echo ""
echo "  obsidian-ai-mcp — switch vault"
echo ""

# ── 1. Show current vault ─────────────────────────────────────────────────────

CURRENT_VAULT="$OBSIDIAN_VAULT"
if [[ -n "$CURRENT_VAULT" ]]; then
  echo "  Current vault: $CURRENT_VAULT"
else
  echo "  No vault currently configured (OBSIDIAN_VAULT not set)"
fi
echo ""

# ── 2. Prompt for new vault path ──────────────────────────────────────────────

DEFAULT_VAULT="${CURRENT_VAULT:-$HOME/Documents/Obsidian Vault}"
read -rp "  New vault path [$DEFAULT_VAULT]: " VAULT_INPUTVAULT_PATH="${VAULT_INPUT:-$DEFAULT_VAULT}"
VAULT_PATH="${VAULT_PATH%\"}"
VAULT_PATH="${VAULT_PATH#\"}"

if [[ "$VAULT_PATH" == "$CURRENT_VAULT" ]]; then
  echo "  Already using this vault — nothing to do."
  exit 0
fi

# ── 3. Create vault folder if needed ─────────────────────────────────────────

if [[ ! -d "$VAULT_PATH" ]]; then
  echo "  Path not found: $VAULT_PATH"
  read -rp "  Create it? [Y/n]: " CREATE_IT  if [[ "${CREATE_IT:-Y}" =~ ^[Yy] ]]; then
    mkdir -p "$VAULT_PATH"
    echo "  Created: $VAULT_PATH"
  else
    echo "  Vault path does not exist. Re-run with a valid path."
    exit 1
  fi
fi

# ── 4. Scaffold Inbox/ + Notes/ if not present ───────────────────────────────

INBOX_PATH="$VAULT_PATH/Inbox"
NOTES_PATH="$VAULT_PATH/Notes"

if [[ ! -d "$INBOX_PATH" ]]; then
  mkdir -p "$INBOX_PATH"

  cat > "$INBOX_PATH/README.md" <<'INBOX_README'
# Inbox

This is the staging area for AI-generated notes. Everything Claude creates lands here first — review it, then promote to Notes/ when ready.

## How to use Claude with this vault

**Start every session:**
```
claude
/mcp
```
You should see `obsidian` listed with 14 tools connected. If it shows 0 tools, exit and re-run `claude`.

**Quick captures** go to `Capture.md` automatically:
- "add a task: review the PR"
- "note that the API rate limit is 100 req/min"

**Structured notes** are created in this folder:
- "create a devlog for today's auth work"
- "create a spec for the caching layer"

**Promote to permanent notes** when ready:
- "promote my devlog from today"
- "what's in my inbox?"
INBOX_README

  cat > "$INBOX_PATH/Capture.md" <<'CAPTURE'
# Capture

Quick tasks, notes, and thoughts. Newest entries at the top.
Claude adds a date to every entry so you always know when it was captured.

---

CAPTURE

  echo "  Created Inbox/ with README.md and Capture.md"
else
  echo "  Inbox/ already exists"
fi

if [[ ! -d "$NOTES_PATH" ]]; then
  mkdir -p "$NOTES_PATH"
  echo "  Created Notes/"
else
  echo "  Notes/ already exists"
fi

# ── 5. Create vault.config.yaml if not present ───────────────────────────────

CONFIG_PATH="$VAULT_PATH/vault.config.yaml"
if [[ ! -f "$CONFIG_PATH" ]]; then
  cat > "$CONFIG_PATH" <<'VAULT_CONFIG'
# obsidian-ai-mcp — vault configuration
inbox_folder: Inbox
notes_folder: Notes
stale_days: 3
promote_delete_source: true
capture_file: Capture.md
stale_exempt:
  - Capture.md
  - README.md
# templates:
#   devlog: |
#     **Date:** {{date}}
#     {{context}}
# custom_types:
#   - name: standup
#     label: Standup
#     template: |
#       # Standup — {{date}}
#       **Yesterday:**
#       **Today:**
#       **Blockers:**
VAULT_CONFIG
  echo "  Created vault.config.yaml"
else
  echo "  vault.config.yaml already exists"
fi

# ── 6. Create vault_context.md if not present ────────────────────────────────

CONTEXT_PATH="$VAULT_PATH/vault_context.md"
if [[ ! -f "$CONTEXT_PATH" ]]; then
  cat > "$CONTEXT_PATH" <<'VAULT_CONTEXT'
# Vault preferences

Claude Code loads this file automatically at every session start.
Edit it to customize how Claude writes and behaves in your vault.

## My preferences

<!-- Add your own preferences below — Claude will follow them every session -->
- My timezone is (fill in, e.g. America/Los_Angeles)
VAULT_CONTEXT
  echo "  Created vault_context.md"
else
  echo "  vault_context.md already exists"
fi

# ── 7. Update OBSIDIAN_VAULT in shell profile ─────────────────────────────────

if [[ -f "$HOME/.zshrc" ]]; then
  SHELL_RC="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then
  SHELL_RC="$HOME/.bashrc"
else
  SHELL_RC="$HOME/.zshrc"
fi

TEMP_RC=$(mktemp)
grep -v 'OBSIDIAN_VAULT' "$SHELL_RC" > "$TEMP_RC" || true
echo "export OBSIDIAN_VAULT=\"$VAULT_PATH\"" >> "$TEMP_RC"
mv "$TEMP_RC" "$SHELL_RC"
export OBSIDIAN_VAULT="$VAULT_PATH"
echo "  OBSIDIAN_VAULT updated in $SHELL_RC"

# ── 8. Update ~/.claude.json ─────────────────────────────────────────────────

python3 - <<PYEOF
import json, os

path = os.path.expanduser("~/.claude.json")
vault = "$VAULT_PATH"

if not os.path.exists(path):
    print("  WARNING: ~/.claude.json not found — run install-mac.sh first.")
    exit(0)

with open(path, "r", encoding="utf-8") as f:
    data = json.load(f)

if "mcpServers" not in data or "obsidian" not in data.get("mcpServers", {}):
    print("  WARNING: obsidian MCP server not found in ~/.claude.json — run install-mac.sh first.")
    exit(0)

data["mcpServers"]["obsidian"]["env"]["OBSIDIAN_VAULT"] = vault

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("  ~/.claude.json updated")
PYEOF

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "  Vault switched to: $VAULT_PATH"
echo ""
echo "  Open a new terminal tab, then run:"
echo "    claude"
echo "    /mcp   (should show: obsidian — 14 tools)"
echo ""
