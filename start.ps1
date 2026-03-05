# Obsidian AI MCP - start server + Cloudflare tunnel
# Starts cloudflared first, waits for URL, then starts server with URL baked in.
# Prints the one-liner to run in Codespace at the end.

$ErrorActionPreference = "Stop"

# Config
$PORT        = "3000"
$AUTH_TOKEN  = "obsidian-mcp-2024"
$VAULT       = "C:\Users\yanfeiliu\OneDrive - Microsoft\Documents\Work2026"
# $TIMEZONE = "America/New_York"  # Uncomment to override — defaults to system timezone
$CLOUDFLARED = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
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
