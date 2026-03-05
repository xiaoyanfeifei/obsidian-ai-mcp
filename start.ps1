# Obsidian AI MCP - start server + Cloudflare tunnel
# Starts cloudflared first, waits for URL, then starts server with URL baked in.
# Prints the one-liner to run in Codespace at the end.

$ErrorActionPreference = "Stop"

# ── Config ────────────────────────────────────────────────────────────────────
# VAULT: reads from OBSIDIAN_VAULT env var (set by install.ps1).
#        If not set, edit the fallback path below.
$VAULT = if ($env:OBSIDIAN_VAULT) { $env:OBSIDIAN_VAULT } else {
    Write-Warning "OBSIDIAN_VAULT env var not set — run install.ps1 first, or set the path below."
    "C:\path\to\your\vault"  # <-- edit if not using install.ps1
}

# AUTH_TOKEN: shared secret between this server and your Codespace.
#             Change to anything secret — anyone with this token can read/write your vault.
$AUTH_TOKEN  = "obsidian-mcp-2024"  # <-- change this

$PORT        = "3000"
# $TIMEZONE = "America/New_York"  # Uncomment to override — defaults to system timezone
$CLOUDFLARED = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
# ──────────────────────────────────────────────────────────────────────────────
$CF_LOG      = "$env:TEMP\obsidian-mcp-cf.log"
$SERVER_SCRIPT = "$PSScriptRoot\dist\index.js"

# 1. Start cloudflared
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Error "cloudflared not found. Install: winget install Cloudflare.cloudflared"
    exit 1
}

# Kill any leftover processes from previous runs
Get-Process cloudflared,node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
if (Test-Path $CF_LOG) { Remove-Item $CF_LOG -Force -ErrorAction SilentlyContinue }

Write-Host "Starting Cloudflare tunnel..." -ForegroundColor Cyan
$cfProcess = Start-Process $CLOUDFLARED `
    -ArgumentList "tunnel --url http://localhost:$PORT" `
    -NoNewWindow -PassThru `
    -RedirectStandardError $CF_LOG

# 2. Wait for tunnel URL (up to 30s)
$tunnelUrl = $null
Write-Host "Waiting for tunnel URL..." -ForegroundColor Cyan

for ($i = 1; $i -le 30; $i++) {
    Start-Sleep 1
    if (Test-Path $CF_LOG) {
        $log = Get-Content $CF_LOG -Raw -ErrorAction SilentlyContinue
        if ($log -match '(https://[\w-]+\.trycloudflare\.com)') {
            $tunnelUrl = $Matches[1]
            break
        }
    }
}

if (-not $tunnelUrl) {
    Write-Error "Timed out waiting for tunnel URL. Check: $CF_LOG"
    Stop-Process -Id $cfProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "Tunnel ready: $tunnelUrl" -ForegroundColor Green

# 3. Start MCP server
$env:MCP_HTTP_PORT  = $PORT
$env:MCP_AUTH_TOKEN = $AUTH_TOKEN
$env:MCP_BASE_URL   = $tunnelUrl
$env:OBSIDIAN_VAULT = $VAULT
# MCP_TIMEZONE not set — server auto-detects from system timezone

Write-Host "Starting MCP server on port $PORT..." -ForegroundColor Cyan
$serverProcess = Start-Process node `
    -ArgumentList $SERVER_SCRIPT `
    -NoNewWindow -PassThru

Start-Sleep 3

# 4. Health check
$healthy = $false
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$PORT/health" -UseBasicParsing -TimeoutSec 5
    $healthy = $true
    Write-Host "Server healthy" -ForegroundColor Green
} catch {
    Write-Warning "Health check failed - server may still be starting."
}

# 5. Print Codespace setup command
Write-Host ""
Write-Host "======================================================" -ForegroundColor Yellow
Write-Host "  Run this in your Codespace to connect:             " -ForegroundColor Yellow
Write-Host "======================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "  curl -s $tunnelUrl/setup.sh | bash" -ForegroundColor Cyan
Write-Host ""
Write-Host "  (then start a fresh Claude session)" -ForegroundColor Gray
Write-Host "======================================================" -ForegroundColor Yellow
Write-Host ""
Write-Host "Ctrl+C to stop." -ForegroundColor Gray

# 6. Keep alive until Ctrl+C
try {
    Wait-Process -Id $serverProcess.Id
} finally {
    Write-Host "Shutting down..." -ForegroundColor Gray
    Stop-Process -Id $serverProcess.Id -Force -ErrorAction SilentlyContinue
    Stop-Process -Id $cfProcess.Id    -Force -ErrorAction SilentlyContinue
}
