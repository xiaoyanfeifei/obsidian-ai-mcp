# obsidian-ai-mcp - start server + Cloudflare connection
# Starts cloudflared first, waits for URL, then starts MCP server.
# Prints the curl command to run in your Codespace at the end.
#
# Reads OBSIDIAN_VAULT and MCP_AUTH_TOKEN from environment (set by install.ps1).

$ErrorActionPreference = "Stop"

$VAULT = if ($env:OBSIDIAN_VAULT) { $env:OBSIDIAN_VAULT } else {
    Write-Warning "OBSIDIAN_VAULT not set - run install.ps1 first."
    "C:\path\to\your\vault"
}

$AUTH_TOKEN = if ($env:MCP_AUTH_TOKEN) { $env:MCP_AUTH_TOKEN } else {
    Write-Warning "MCP_AUTH_TOKEN not set - run install.ps1 first."
    "obsidian-mcp-insecure-default"
}

$PORT        = "3000"
$CLOUDFLARED = "C:\Program Files (x86)\cloudflared\cloudflared.exe"
$CF_LOG      = "$env:TEMP\obsidian-mcp-cf.log"
$LOCAL_SCRIPT = "$PSScriptRoot\dist\index.js"
$USE_NPX = -not (Test-Path $LOCAL_SCRIPT)

# 1. Check / install cloudflared
if (-not (Test-Path $CLOUDFLARED)) {
    Write-Host "  cloudflared not found." -ForegroundColor Yellow
    $installCf = Read-Host "  Install cloudflared via winget? [Y/n]"
    if ($installCf -notmatch '^[Nn]') {
        winget install --id Cloudflare.cloudflared -e --accept-source-agreements --accept-package-agreements
        if (-not (Test-Path $CLOUDFLARED)) {
            Write-Error "cloudflared still not found. Check path: $CLOUDFLARED"
            exit 1
        }
        Write-Host "  OK cloudflared installed" -ForegroundColor Green
    } else {
        Write-Error "cloudflared required. Install: winget install Cloudflare.cloudflared"
        exit 1
    }
}

# Kill any leftover processes from previous runs
Get-Process cloudflared,node -ErrorAction SilentlyContinue | Stop-Process -Force -ErrorAction SilentlyContinue
Start-Sleep 1
if (Test-Path $CF_LOG) { Remove-Item $CF_LOG -Force -ErrorAction SilentlyContinue }

Write-Host "Starting Cloudflare connection..." -ForegroundColor Cyan
$cfProcess = Start-Process $CLOUDFLARED `
    -ArgumentList "tunnel --url http://localhost:$PORT" `
    -NoNewWindow -PassThru `
    -RedirectStandardError $CF_LOG

# 2. Wait for connection URL (up to 30s)
$tunnelUrl = $null
Write-Host "Waiting for connection URL..." -ForegroundColor Cyan

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
    Write-Error "Timed out waiting for connection URL. Check: $CF_LOG"
    Stop-Process -Id $cfProcess.Id -Force -ErrorAction SilentlyContinue
    exit 1
}

Write-Host "Connection ready: $tunnelUrl" -ForegroundColor Green

# 3. Start MCP server
$env:MCP_HTTP_PORT  = $PORT
$env:MCP_AUTH_TOKEN = $AUTH_TOKEN
$env:MCP_BASE_URL   = $tunnelUrl
$env:OBSIDIAN_VAULT = $VAULT

Write-Host "Starting MCP server on port $PORT..." -ForegroundColor Cyan
if ($USE_NPX) {
    Write-Host "  (using npx obsidian-ai-mcp@latest)" -ForegroundColor Gray
    $serverProcess = Start-Process npx `
        -ArgumentList "obsidian-ai-mcp@latest" `
        -NoNewWindow -PassThru
} else {
    Write-Host "  (using local build)" -ForegroundColor Gray
    $serverProcess = Start-Process node `
        -ArgumentList $LOCAL_SCRIPT `
        -NoNewWindow -PassThru
}

Start-Sleep 3

# 4. Health check
try {
    $resp = Invoke-WebRequest -Uri "http://localhost:$PORT/health" -UseBasicParsing -TimeoutSec 5
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
Write-Host "  (then: claude -> /mcp -> Authenticate -> fresh session)" -ForegroundColor Gray
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
