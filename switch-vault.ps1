# obsidian-ai-mcp — switch vault
# Updates OBSIDIAN_VAULT env var and ~/.claude.json to point at a different vault.
# Scaffolds Inbox/, Notes/, and starter files if the new vault doesn't have them yet.
#
# Usage:
#   irm https://raw.githubusercontent.com/xiaoyanfeifei/obsidian-ai-mcp/master/switch-vault.ps1 | iex
# Or if you already have it:
#   .\switch-vault.ps1

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  obsidian-ai-mcp — switch vault" -ForegroundColor Magenta
Write-Host ""

# ── 1. Show current vault ─────────────────────────────────────────────────────

$currentVault = [System.Environment]::GetEnvironmentVariable("OBSIDIAN_VAULT", "User")
if ($currentVault) {
    Write-Host "  Current vault: $currentVault" -ForegroundColor Gray
} else {
    Write-Host "  No vault currently configured (OBSIDIAN_VAULT not set)" -ForegroundColor Yellow
}
Write-Host ""

# ── 2. Prompt for new vault path ──────────────────────────────────────────────

$defaultVault = if ($currentVault) { $currentVault } else { "$env:USERPROFILE\Documents\Obsidian Vault" }
$vaultInput = Read-Host "  New vault path [$defaultVault]"
if ([string]::IsNullOrWhiteSpace($vaultInput)) {
    $vaultPath = $defaultVault
} else {
    $vaultPath = $vaultInput.Trim().Trim('"')
}

if ($vaultPath -eq $currentVault) {
    Write-Host "  Already using this vault — nothing to do." -ForegroundColor Green
    exit 0
}

# ── 3. Create vault folder if it doesn't exist ───────────────────────────────

if (-not (Test-Path $vaultPath)) {
    Write-Warning "Path not found: $vaultPath"
    $create = Read-Host "  Create it? [Y/n]"
    if ($create -notmatch '^[Nn]') {
        New-Item -ItemType Directory -Path $vaultPath -Force | Out-Null
        Write-Host "  Created: $vaultPath" -ForegroundColor Green
    } else {
        Write-Error "Vault path does not exist. Re-run with a valid path."
        exit 1
    }
}

# ── 4. Scaffold Inbox/ + Notes/ if not present ───────────────────────────────

$inboxPath = Join-Path $vaultPath "Inbox"
$notesPath = Join-Path $vaultPath "Notes"

if (-not (Test-Path $inboxPath)) {
    New-Item -ItemType Directory -Path $inboxPath -Force | Out-Null

    $inboxReadme = @"
# Inbox

This is the staging area for AI-generated notes. Everything Claude creates lands here first — review it, then promote to Notes/ when ready.

## How to use Claude with this vault

**Start every session:**
``````
claude
/mcp
``````
You should see ``obsidian`` listed with 14 tools connected. If it shows 0 tools, exit and re-run ``claude``.

**Quick captures** (tasks, thoughts, reminders) go to ``Capture.md`` automatically:
- "add a task: review the PR"
- "note that the API rate limit is 100 req/min"
- "remind me to follow up with the team this week"

**Structured notes** are created in this folder:
- "create a devlog for today's auth work"
- "create a spec for the caching layer"
- "log my 2pm meeting with the team"

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

## Special files

- ``Capture.md`` — quick scratch pad; tasks and short notes go here, newest at top
- ``README.md`` — this file; never deleted or promoted
"@
    $inboxReadme | Set-Content -Path (Join-Path $inboxPath "README.md") -Encoding UTF8

    $captureContent = @"
# Capture

Quick tasks, notes, and thoughts. Newest entries at the top.
Claude adds a date to every entry so you always know when it was captured.

---

"@
    $captureContent | Set-Content -Path (Join-Path $inboxPath "Capture.md") -Encoding UTF8
    Write-Host "  Created Inbox/ with README.md and Capture.md" -ForegroundColor Green
} else {
    Write-Host "  Inbox/ already exists" -ForegroundColor Gray
}

if (-not (Test-Path $notesPath)) {
    New-Item -ItemType Directory -Path $notesPath -Force | Out-Null
    Write-Host "  Created Notes/" -ForegroundColor Green
} else {
    Write-Host "  Notes/ already exists" -ForegroundColor Gray
}

# ── 5. Create vault.config.yaml if not present ───────────────────────────────

$configPath = Join-Path $vaultPath "vault.config.yaml"
if (-not (Test-Path $configPath)) {
    $vaultConfig = @"
# obsidian-ai-mcp — vault configuration
# Edit this file to customize the server's behavior.
# Restart the MCP server after making changes.
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
capture_file: Capture.md     # File in inbox_folder that gets prepend (position:top) behavior
stale_exempt:                 # Files never flagged as stale in vault_review
  - Capture.md
  - README.md

# ── Template overrides (optional) ────────────────────────────────────────────
# Override a built-in note type template.
# Available placeholders: {{topic}}, {{date}}, {{time}}, {{context}}
# Built-in types: devlog, learning, spec, note, meeting, decision
#
# templates:
#   devlog: |
#     # Devlog: {{topic}}
#     **Date:** {{date}}
#     {{context}}
#
#     ---
#
#     ### {{time}} — Starting point

# ── Custom note types (optional) ──────────────────────────────────────────────
# Add your own note types beyond the built-in set.
#
# custom_types:
#   - name: standup
#     label: Standup
#     template: |
#       # Standup — {{date}}
#       **Yesterday:**
#       **Today:**
#       **Blockers:**
#
#   - name: 1on1
#     label: 1on1
#     template: |
#       # 1:1 — {{topic}} — {{date}}
#       **Agenda:**
#       **Notes:**
#       **Actions:**
"@
    $vaultConfig | Set-Content -Path $configPath -Encoding UTF8
    Write-Host "  Created vault.config.yaml" -ForegroundColor Green
} else {
    Write-Host "  vault.config.yaml already exists" -ForegroundColor Gray
}

# ── 6. Create vault_context.md if not present ────────────────────────────────

$contextPath = Join-Path $vaultPath "vault_context.md"
if (-not (Test-Path $contextPath)) {
    $vaultContext = @"
# Vault preferences

Claude Code loads this file automatically at every session start.
Edit it to customize how Claude writes and behaves in your vault.

## Writing style

Notes are personal — written for quick re-reading and thinking, not for an audience.

1. **Big picture first.** One sentence: what is this and why does it matter.
2. **Source is first-class.** Attribute every claim. Open with ``> Source: ...`` for external-source notes.
3. **Mark confidence.** unverified · ``[repo]`` confirmed in code · ``[teams]`` from conversation.
4. **Known vs unknown.** Gaps as explicit ``- [ ]`` open questions — not silence.
5. **Relationships.** Use ``[[wikilinks]]``. Name the people and systems involved.
6. **Status at a glance.** / / for anything with moving parts.
7. **Next steps.** End with what to do when coming back.
8. **Minimum length.** Cut anything that doesn't add understanding.

## My preferences

<!-- Add your own preferences below — Claude will follow them every session -->
- My timezone is (fill in, e.g. America/Los_Angeles)
"@
    $vaultContext | Set-Content -Path $contextPath -Encoding UTF8
    Write-Host "  Created vault_context.md" -ForegroundColor Green
} else {
    Write-Host "  vault_context.md already exists" -ForegroundColor Gray
}

# ── 7. Update OBSIDIAN_VAULT env var ─────────────────────────────────────────

[System.Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT", $vaultPath, "User")
$env:OBSIDIAN_VAULT = $vaultPath
Write-Host "  OBSIDIAN_VAULT updated" -ForegroundColor Green

# ── 8. Update ~/.claude.json MCP entry ───────────────────────────────────────

$claudeJsonPath = "$env:USERPROFILE\.claude.json"
if (Test-Path $claudeJsonPath) {
    $claudeJson = Get-Content $claudeJsonPath -Raw | ConvertFrom-Json
    if ($claudeJson.mcpServers -and $claudeJson.mcpServers.obsidian) {
        $claudeJson.mcpServers.obsidian.env.OBSIDIAN_VAULT = $vaultPath
        $claudeJson | ConvertTo-Json -Depth 10 | Set-Content $claudeJsonPath -Encoding UTF8
        Write-Host "  ~/.claude.json updated" -ForegroundColor Green
    } else {
        Write-Warning "obsidian MCP server not found in ~/.claude.json — run install.ps1 first to register it."
    }
} else {
    Write-Warning "~/.claude.json not found — run install.ps1 first to register the MCP server."
}

# ── Done ──────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Vault switched to: $vaultPath" -ForegroundColor Green
Write-Host ""
Write-Host "  Open a new terminal and run:" -ForegroundColor Yellow
Write-Host "    claude" -ForegroundColor Cyan
Write-Host "    /mcp   (should show obsidian — 14 tools)" -ForegroundColor Cyan
Write-Host ""
