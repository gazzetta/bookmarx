# run-l2-website.ps1
#
# Runs the L2 Playwright website suite. Designed to drop into a Wave block via
# `wsh run -m -- pwsh -ExecutionPolicy Bypass -File ./run-l2-website.ps1`.
#
# Pre-requisites (the agent will start the dev server in a separate Wave block
# before invoking this script; both pre-reqs are checked below):
#   1. The unified Next.js + API server is running on http://localhost:3005
#      (start it via: `cd src/website; npm run dev`)
#   2. Optional: BOOKMARX_PREMIUM_PASSWORD env var is set to
#     `qa@bookmarx.cc`'s real password (use
#     `wsh setvar --workspace BOOKMARX_PREMIUM_PASSWORD=<pw>`). Without it,
#     three premium-path tests SKIP rather than fail.
#
# Exit codes: 0 success, 1 on test failure, 2 if the dev server is not up.

[CmdletBinding()]
param(
    [string]$BaseUrl = ($env:BOOKMARX_BASE_URL ?? 'http://localhost:3005')
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot

# ---- Load .env.local for test credentials -----------------------------
$envLocal = Join-Path $repoRoot 'src\website\.env.local'
if (Test-Path $envLocal) {
    Get-Content $envLocal | ForEach-Object {
        $line = $_.Trim()
        if ($line -and -not $line.StartsWith('#') -and $line.Contains('=')) {
            $parts = $line -split '=', 2
            $key = $parts[0].Trim()
            $val = $parts[1].Trim()
            if (-not [Environment]::GetEnvironmentVariable($key, 'Process')) {
                [Environment]::SetEnvironmentVariable($key, $val, 'Process')
            }
        }
    }
    Write-Host '==> Loaded .env.local' -ForegroundColor Green
}

# ---- Pre-flight: confirm dev server is up -----------------------------
Write-Host ''
Write-Host '==> Probing dev server at ' -ForegroundColor Cyan -NoNewline
Write-Host $BaseUrl -ForegroundColor Cyan
try {
    $health = Invoke-WebRequest -Uri "$BaseUrl/health" -TimeoutSec 5 -UseBasicParsing
    if ($health.StatusCode -ne 200) { throw "$($health.StatusCode)" }
    Write-Host '    dev server is up' -ForegroundColor Green
} catch {
    Write-Host "    dev server not responding at $BaseUrl/health: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host '    Start it first: cd src/website; npm run dev' -ForegroundColor Yellow
    exit 2
}

# ---- Run Playwright ---------------------------------------------------
Write-Host ''
Write-Host '==> Running L2 website Playwright suite' -ForegroundColor Cyan
$env:BOOKMARX_BASE_URL = $BaseUrl
Push-Location $repoRoot
try {
    & npx playwright test --config=playwright.website.config.ts --reporter=list
    $tests = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($tests -ne 0) {
    Write-Host ''
    Write-Host 'L2 suite failed.' -ForegroundColor Red
    Write-Host 'Traces per test are under test-results/. Review via:'
    Write-Host '  npx playwright show-trace test-results\<spec-dir>\trace.zip'
    if (Get-Command wsh -ErrorAction SilentlyContinue) {
        & wsh notify 'BookMarx L2 website suite FAILED — see terminal'
    }
    exit 1
}

Write-Host ''
Write-Host 'L2 website suite passed.' -ForegroundColor Green
if (Get-Command wsh -ErrorAction SilentlyContinue) {
    & wsh notify 'BookMarx L2 website suite: all green'
}