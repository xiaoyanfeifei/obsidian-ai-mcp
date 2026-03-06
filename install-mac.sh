#!/bin/bash
# obsidian-ai-mcp — local installer for macOS
# Registers the MCP server with Claude Code so your vault is available in every session.
#
# Usage:
#   curl -fsSL https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/install-mac.sh -o install-mac.sh
#   bash install-mac.sh

set -e


echo ""
echo "  obsidian-ai-mcp — local installer (macOS)"
echo ""

# ── 1. Check Node.js ─────────────────────────────────────────────────────────

if ! command -v node &>/dev/null; then
  echo "  ERROR: Node.js not found."
  echo "  Install it with Homebrew:  brew install node"
  echo "  Or download from:          https://nodejs.org"
  exit 1
fi

NODE_VERSION=$(node -e "process.exit(parseInt(process.version.slice(1)) < 18 ? 1 : 0)" 2>/dev/null && echo "ok" || echo "old")
if [[ "$NODE_VERSION" == "old" ]]; then
  echo "  ERROR: Node.js 18+ required. Current: $(node --version)"
  echo "  Upgrade:  brew upgrade node   or   nvm install 18"
  exit 1
fi
echo "  Node.js $(node --version)"

# ── 2. Check Claude Code CLI ─────────────────────────────────────────────────

if ! command -v claude &>/dev/null; then
  echo "  ERROR: Claude Code CLI not found."
  echo "  Install it from: https://claude.ai/code"
  exit 1
fi
echo "  Claude Code CLI found"

# ── 3. Vault path ─────────────────────────────────────────────────────────────

echo ""
echo "  Where is your Obsidian vault?"
echo "  (The folder containing your .md files — Obsidian does not need to be running)"
echo ""

DEFAULT_VAULT="$HOME/Documents/Obsidian Vault"
echo "  Enter the full path, e.g. /Users/$(whoami)/Documents/MyVault"
echo "  (Do not use ~ — type the full path or press Enter for the default)"
echo ""
read -rp "  Vault path [$DEFAULT_VAULT]: " VAULT_INPUT
VAULT_PATH="${VAULT_INPUT:-$DEFAULT_VAULT}"
# Strip surrounding quotes if user pasted a quoted path
VAULT_PATH="${VAULT_PATH%\"}"
VAULT_PATH="${VAULT_PATH#\"}"
# Expand ~ in case user typed it anyway
VAULT_PATH="${VAULT_PATH/#\~/$HOME}"

if [[ ! -d "$VAULT_PATH" ]]; then
  echo "  Path not found: $VAULT_PATH"
  read -rp "  Create it? [Y/n]: " CREATE_IT
  if [[ "${CREATE_IT:-Y}" =~ ^[Yy] ]]; then
    mkdir -p "$VAULT_PATH"
    echo "  Created: $VAULT_PATH"
  else
    echo "  Vault path does not exist. Re-run with a valid path."
    exit 1
  fi
fi
echo "  Vault: $VAULT_PATH"

# ── 4. Persist OBSIDIAN_VAULT in shell profile ───────────────────────────────
# To switch to a different vault later, run switch-vault.sh — it updates only
# the vault path (shell profile + .claude.json) without re-running this installer.

# Detect shell profile
if [[ -f "$HOME/.zshrc" ]]; then
  SHELL_RC="$HOME/.zshrc"
elif [[ -f "$HOME/.bashrc" ]]; then
  SHELL_RC="$HOME/.bashrc"
else
  SHELL_RC="$HOME/.zshrc"
  touch "$SHELL_RC"
fi

# Remove any previous OBSIDIAN_VAULT line and append the new one
TEMP_RC=$(mktemp)
grep -v 'OBSIDIAN_VAULT' "$SHELL_RC" > "$TEMP_RC" || true
echo "export OBSIDIAN_VAULT=\"$VAULT_PATH\"" >> "$TEMP_RC"
mv "$TEMP_RC" "$SHELL_RC"
export OBSIDIAN_VAULT="$VAULT_PATH"
echo "  OBSIDIAN_VAULT saved to $SHELL_RC"

# ── 5. Scaffold vault structure if needed ────────────────────────────────────

INBOX_PATH="$VAULT_PATH/Inbox"
NOTES_PATH="$VAULT_PATH/Notes"

if [[ ! -d "$INBOX_PATH" ]] && [[ ! -d "$NOTES_PATH" ]]; then
  echo ""
  read -rp "  Set up Inbox/ and Notes/ folder structure? [Y/n]: " SCAFFOLD
  if [[ "${SCAFFOLD:-Y}" =~ ^[Yy] ]]; then
    mkdir -p "$INBOX_PATH" "$NOTES_PATH"

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

## Note types

| Type | Use for |
|------|---------|
| devlog | Session logs while working on a task or PR |
| learning | Capturing something new you learned |
| spec | Feature or design specs |
| note | Freeform notes |
| meeting | Daily meeting log (one file per day) |
| decision | Architecture Decision Records |
INBOX_README

    cat > "$INBOX_PATH/Capture.md" <<'CAPTURE'
# Capture

Quick tasks, notes, and thoughts. Newest entries at the top.
Claude adds a date to every entry so you always know when it was captured.

---

CAPTURE

    echo "  Created Inbox/ and Notes/ with starter files"
  fi
elif [[ -d "$INBOX_PATH" ]] || [[ -d "$NOTES_PATH" ]]; then
  echo "  Vault structure already exists"
fi

# ── 6. Generate auth token (used by Codespace / HTTP mode) ───────────────────

if ! grep -q 'MCP_AUTH_TOKEN' "$SHELL_RC" 2>/dev/null; then
  TOKEN=$(LC_ALL=C tr -dc 'a-z0-9' < /dev/urandom | head -c 32)
  echo "export MCP_AUTH_TOKEN=\"$TOKEN\"" >> "$SHELL_RC"
  export MCP_AUTH_TOKEN="$TOKEN"
  echo "  Auth token generated and saved to $SHELL_RC"
else
  echo "  Auth token already set (MCP_AUTH_TOKEN)"
fi

# ── 7. Create vault.config.yaml if not present ───────────────────────────────

CONFIG_PATH="$VAULT_PATH/vault.config.yaml"
if [[ ! -f "$CONFIG_PATH" ]]; then
  cat > "$CONFIG_PATH" <<'VAULT_CONFIG'
# obsidian-ai-mcp — vault configuration
# Edit this file to customize the server's behavior.
# Restart the MCP server (start a new Claude session) after making changes.
#
# FIXED (cannot be changed):
#   - New notes always go to inbox_folder first
#   - Permanent notes are append-only (never overwritten)
#   - Frontmatter is auto-injected for all Inbox notes

# ── Folder names ──────────────────────────────────────────────────────────────
inbox_folder: Inbox    # Staging area for new AI-generated notes
notes_folder: Notes    # Permanent notes (promoted from Inbox)

# ── vault_review settings ─────────────────────────────────────────────────────
stale_days: 3          # Flag Inbox drafts older than this many days

# ── promote_note settings ─────────────────────────────────────────────────────
promote_delete_source: true   # Delete Inbox draft after successful promotion

# ── Capture file and stale exemptions ────────────────────────────────────────
capture_file: Capture.md
stale_exempt:
  - Capture.md
  - README.md

# ── Template overrides (optional) ────────────────────────────────────────────
# templates:
#   devlog: |
#     **Date:** {{date}}
#     {{context}}
#
#     ---
#
#     ### {{time}} — Starting point

# ── Custom note types (optional) ──────────────────────────────────────────────
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
fi

# ── 8. Create vault_context.md if not present ────────────────────────────────

CONTEXT_PATH="$VAULT_PATH/vault_context.md"
if [[ ! -f "$CONTEXT_PATH" ]]; then
  cat > "$CONTEXT_PATH" <<'VAULT_CONTEXT'
# Vault preferences

Claude Code loads this file automatically at every session start.
Edit it to customize how Claude writes and behaves in your vault.

## Writing style

Notes are personal — written for quick re-reading and thinking, not for an audience.

1. **Big picture first.** One sentence: what is this and why does it matter.
2. **Source is first-class.** Attribute every claim. Open with `> Source: ...` for external-source notes.
3. **Mark confidence.** ⚠️ unverified · `[repo]` confirmed in code · `[teams]` from conversation.
4. **Known vs unknown.** Gaps as explicit `- [ ]` open questions — not silence.
5. **Relationships.** Use `[[wikilinks]]`. Name the people and systems involved.
6. **Status at a glance.** ✅ / 🔄 / 🔜 for anything with moving parts.
7. **Next steps.** End with what to do when coming back.
8. **Minimum length.** Cut anything that doesn't add understanding.

## My preferences

<!-- Add your own preferences below — Claude will follow them every session -->
- My timezone is (fill in, e.g. America/Los_Angeles)
VAULT_CONTEXT
  echo "  Created vault_context.md"
fi

# ── 9. Register MCP server in ~/.claude.json ─────────────────────────────────

CLAUDE_JSON="$HOME/.claude.json"

python3 - <<PYEOF
import json, os, sys

path = os.path.expanduser("~/.claude.json")
vault = os.environ.get("OBSIDIAN_VAULT", "")

entry = {
    "type": "stdio",
    "command": "npx",
    "args": ["obsidian-ai-mcp@latest"],
    "env": {"OBSIDIAN_VAULT": vault}
}

if os.path.exists(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
else:
    data = {}

if "mcpServers" not in data:
    data["mcpServers"] = {}

data["mcpServers"]["obsidian"] = entry

with open(path, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
    f.write("\n")

print("  Registered obsidian MCP server in ~/.claude.json")
PYEOF

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo "  All done! Open a new terminal tab, then run:"
echo ""
echo "    claude"
echo "    /mcp   (should show: obsidian — 14 tools)"
echo ""
echo "  If you see 0 tools, exit claude and run it again."
echo ""
