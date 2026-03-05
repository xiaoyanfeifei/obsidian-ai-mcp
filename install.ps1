# obsidian-ai-mcp — One-step installer for Windows
# Usage: iex (irm https://raw.githubusercontent.com/yanfeiliu/obsidian-ai-mcp/main/install.ps1)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "  obsidian-ai-mcp installer" -ForegroundColor Cyan
Write-Host "  ─────────────────────────" -ForegroundColor Cyan
Write-Host ""

# ── 1. Check Node.js ──────────────────────────────────────────────────────────

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Error "Node.js not found. Install v18+ from https://nodejs.org and re-run."
    exit 1
}
$nodeVersion = (node --version) -replace 'v', ''
$nodeMajor = [int]($nodeVersion -split '\.')[0]
if ($nodeMajor -lt 18) {
    Write-Error "Node.js v18+ required. Found v$nodeVersion — upgrade at https://nodejs.org"
    exit 1
}
Write-Host "  ✓ Node.js v$nodeVersion" -ForegroundColor Green

# ── 2. Check / install Obsidian ───────────────────────────────────────────────

Write-Host "  Obsidian is the app you'll use to browse and edit your notes." -ForegroundColor Gray
Write-Host "  (The MCP server reads .md files directly — Obsidian doesn't need to be running.)" -ForegroundColor Gray
Write-Host ""

$obsidianInstalled = (Get-Command Obsidian -ErrorAction SilentlyContinue) -or `
    (Test-Path "$env:LOCALAPPDATA\Obsidian\Obsidian.exe") -or `
    (winget list --id Obsidian.Obsidian -e 2>$null | Select-String "Obsidian")

if ($obsidianInstalled) {
    Write-Host "  ✓ Obsidian" -ForegroundColor Green
} else {
    Write-Host "  Obsidian not found." -ForegroundColor Yellow
    $installObsidian = Read-Host "  Install Obsidian now via winget? [Y/n]"
    if ($installObsidian -notmatch '^[Nn]') {
        winget install --id Obsidian.Obsidian -e --accept-source-agreements --accept-package-agreements
        Write-Host ""
        Write-Host "  ✓ Obsidian installed." -ForegroundColor Green
        Write-Host ""
        Write-Host "  ┌─ Next: create your vault in Obsidian ──────────────────────────────┐" -ForegroundColor Yellow
        Write-Host "  │  1. Open Obsidian                                                   │" -ForegroundColor Yellow
        Write-Host "  │  2. Click 'Create new vault'                                        │" -ForegroundColor Yellow
        Write-Host "  │  3. Choose a folder (e.g. Documents\MyVault)                        │" -ForegroundColor Yellow
        Write-Host "  │  4. Come back here and press Enter to continue                      │" -ForegroundColor Yellow
        Write-Host "  └─────────────────────────────────────────────────────────────────────┘" -ForegroundColor Yellow
        Write-Host ""
        Read-Host "  Press Enter when your vault is ready"
    } else {
        Write-Host "  Skipping Obsidian install. You can install it later from https://obsidian.md" -ForegroundColor Gray
        Write-Host "  The MCP server will still work — Obsidian is just the UI for browsing notes." -ForegroundColor Gray
    }
}

# ── 3. Check Claude Code CLI ──────────────────────────────────────────────────

if (-not (Get-Command claude -ErrorAction SilentlyContinue)) {
    Write-Error "Claude Code CLI not found. Install it first: https://claude.ai/code"
    exit 1
}
Write-Host "  ✓ Claude Code CLI" -ForegroundColor Green

# ── 4. Vault path ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  Where is your Obsidian vault?" -ForegroundColor Yellow
Write-Host "  (The folder containing your .md files — Obsidian does not need to be running)"
Write-Host ""

$defaultVault = "$env:USERPROFILE\Documents\Obsidian Vault"
$vaultInput = Read-Host "  Vault path [$defaultVault]"
if ([string]::IsNullOrWhiteSpace($vaultInput)) {
    $vaultPath = $defaultVault
} else {
    $vaultPath = $vaultInput.Trim().Trim('"')
}

if (-not (Test-Path $vaultPath)) {
    Write-Warning "Path not found: $vaultPath"
    $create = Read-Host "  Create it? (y/N)"
    if ($create -match '^[Yy]') {
        New-Item -ItemType Directory -Path $vaultPath -Force | Out-Null
        Write-Host "  Created: $vaultPath" -ForegroundColor Green
    } else {
        Write-Error "Vault path does not exist. Re-run with a valid path."
        exit 1
    }
}

Write-Host "  ✓ Vault: $vaultPath" -ForegroundColor Green

# ── 5. Set OBSIDIAN_VAULT as permanent user environment variable ───────────────

[System.Environment]::SetEnvironmentVariable("OBSIDIAN_VAULT", $vaultPath, "User")
$env:OBSIDIAN_VAULT = $vaultPath
Write-Host "  ✓ OBSIDIAN_VAULT saved as user environment variable" -ForegroundColor Green

# ── 6. Scaffold or migrate vault structure ────────────────────────────────────

$inboxPath = Join-Path $vaultPath "Inbox"
$notesPath = Join-Path $vaultPath "Notes"

$inboxExists = Test-Path $inboxPath
$notesExists = Test-Path $notesPath

# Check for existing .md files at vault root (not in subdirectories)
$rootMdFiles = Get-ChildItem -Path $vaultPath -Filter "*.md" -File -ErrorAction SilentlyContinue

if (-not $inboxExists -and -not $notesExists) {
    # Brand new vault — scaffold cleanly
    Write-Host ""
    $scaffold = Read-Host "  Set up Inbox/ and Notes/ folder structure? [Y/n]"
    if ($scaffold -notmatch '^[Nn]') {
        New-Item -ItemType Directory -Path $inboxPath -Force | Out-Null
        New-Item -ItemType Directory -Path $notesPath -Force | Out-Null

        $inboxReadme = @"
# Inbox

This folder is the staging area for AI-generated notes.

All new notes created by Claude land here first, with a date prefix:

    YYYY-MM-DD - Type - Topic.md

## Note types

| Type | Use for |
|------|---------|
| devlog | Session logs while working on a task or PR |
| learning | Capturing something new you learned |
| spec | Feature or design specs |
| note | Freeform notes |
| meeting | Daily meeting log (one file per day) |
| decision | Architecture Decision Records |

## Workflow

1. Claude creates and updates notes here during your session
2. Review the draft when you're ready
3. Use ``promote_note`` to move it to ``Notes/`` as a permanent note
4. The Inbox draft is deleted after promotion

## Special files

- ``Capture.md`` — quick scratch pad; new entries go to the top
- ``README.md`` — this file; never deleted or promoted
"@
        $inboxReadme | Set-Content -Path (Join-Path $inboxPath "README.md") -Encoding UTF8
        Write-Host "  ✓ Vault structure created (Inbox/ + Notes/)" -ForegroundColor Green
    }
} elseif ($rootMdFiles.Count -gt 0) {
    # Existing vault with notes at the root — offer to migrate
    Write-Host ""
    Write-Host "  Found $($rootMdFiles.Count) existing note(s) at vault root:" -ForegroundColor Yellow
    foreach ($f in $rootMdFiles | Select-Object -First 5) {
        Write-Host "    $($f.Name)" -ForegroundColor Gray
    }
    if ($rootMdFiles.Count -gt 5) {
        Write-Host "    ... and $($rootMdFiles.Count - 5) more" -ForegroundColor Gray
    }
    Write-Host ""
    $migrate = Read-Host "  Move existing notes to Notes/ and create Inbox/ for AI content? [Y/n]"
    if ($migrate -notmatch '^[Nn]') {
        # Create Notes/ if needed
        if (-not $notesExists) {
            New-Item -ItemType Directory -Path $notesPath -Force | Out-Null
        }
        # Move root .md files to Notes/
        $moved = 0
        foreach ($file in $rootMdFiles) {
            $dest = Join-Path $notesPath $file.Name
            if (-not (Test-Path $dest)) {
                Move-Item -Path $file.FullName -Destination $dest
                $moved++
            } else {
                Write-Warning "Skipped (already exists in Notes/): $($file.Name)"
            }
        }
        Write-Host "  ✓ Moved $moved note(s) to Notes/" -ForegroundColor Green

        # Create Inbox/ if needed
        if (-not $inboxExists) {
            New-Item -ItemType Directory -Path $inboxPath -Force | Out-Null

            $inboxReadme = @"
# Inbox

This folder is the staging area for AI-generated notes.

All new notes created by Claude land here first, with a date prefix:

    YYYY-MM-DD - Type - Topic.md

## Note types

| Type | Use for |
|------|---------|
| devlog | Session logs while working on a task or PR |
| learning | Capturing something new you learned |
| spec | Feature or design specs |
| note | Freeform notes |
| meeting | Daily meeting log (one file per day) |
| decision | Architecture Decision Records |

## Workflow

1. Claude creates and updates notes here during your session
2. Review the draft when you're ready
3. Use ``promote_note`` to move it to ``Notes/`` as a permanent note
4. The Inbox draft is deleted after promotion

## Special files

- ``Capture.md`` — quick scratch pad; new entries go to the top
- ``README.md`` — this file; never deleted or promoted
"@
            $inboxReadme | Set-Content -Path (Join-Path $inboxPath "README.md") -Encoding UTF8
            Write-Host "  ✓ Created Inbox/ with README" -ForegroundColor Green
        }
    }
} else {
    Write-Host "  ✓ Vault structure looks good" -ForegroundColor Green
}

# ── 7. Generate auth token (for Codespace / HTTP transport) ──────────────────

$existingToken = [System.Environment]::GetEnvironmentVariable("MCP_AUTH_TOKEN", "User")
if (-not $existingToken) {
    $token = -join ((48..57) + (97..122) | Get-Random -Count 32 | ForEach-Object { [char]$_ })
    [System.Environment]::SetEnvironmentVariable("MCP_AUTH_TOKEN", $token, "User")
    $env:MCP_AUTH_TOKEN = $token
    Write-Host "  ✓ Auth token generated and saved as MCP_AUTH_TOKEN" -ForegroundColor Green
} else {
    Write-Host "  ✓ Auth token already set (MCP_AUTH_TOKEN)" -ForegroundColor Green
}

# ── 8. Write vault.config.yaml if not present ────────────────────────────────

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
    Write-Host "  ✓ vault.config.yaml created" -ForegroundColor Green
}

# ── 9. Register MCP server with Claude Code ───────────────────────────────────

Write-Host ""
Write-Host "  Registering MCP server..." -ForegroundColor Cyan

claude mcp remove obsidian 2>$null

claude mcp add obsidian `
    --env "OBSIDIAN_VAULT=$vaultPath" `
    -- npx -y obsidian-ai-mcp

Write-Host ""
Write-Host "  ✓ Done!" -ForegroundColor Green
Write-Host ""
Write-Host "  ──────────────────────────────────────────" -ForegroundColor Yellow
Write-Host "  Next steps:" -ForegroundColor Yellow
Write-Host ""
Write-Host "    1. Start Claude:  claude" -ForegroundColor White
Write-Host "    2. Verify tools:  /mcp" -ForegroundColor White
Write-Host ""
Write-Host "  Try asking Claude:" -ForegroundColor Gray
Write-Host "    what's in my vault?" -ForegroundColor Gray
Write-Host "    create a devlog for today's work" -ForegroundColor Gray
Write-Host "    show my open tasks" -ForegroundColor Gray
Write-Host "  ──────────────────────────────────────────" -ForegroundColor Yellow
Write-Host ""
