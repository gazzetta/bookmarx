# run-l3-extension.ps1
#
# Runs the L3 Playwright extension suite. Designed for a Wave block via
# `wsh run -m -- pwsh -ExecutionPolicy Bypass -File ./run-l3-extension.ps1`.
#
# Pre-requisites:
#   1. Extension is built: cd src/extension; npm run build:chrome
#      (produces src/extension/dist/manifest.json)
#   2. Dev server running on http://localhost:3005
#      (start via: cd src/website; npm run dev)
#   3. Optional: BOOKMARX_PREMIUM_PASSWORD set for premium-path tests.
#
# Exit codes: 0 success, 1 on test failure, 2 if pre-flight fails.

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

# ---- Pre-flight: check extension is built -----------------------------
$extManifest = Join-Path $repoRoot 'src\extension\dist\manifest.json'
if (-not (Test-Path $extManifest)) {
    Write-Host '==> Extension not built. Building now...' -ForegroundColor Yellow
    Push-Location (Join-Path $repoRoot 'src\extension')
    try {
        & npm run build:chrome
        if ($LASTEXITCODE -ne 0) { throw 'Extension build failed' }
    } finally {
        Pop-Location
    }
    if (-not (Test-Path $extManifest)) {
        Write-Host '    Extension build did not produce dist/manifest.json' -ForegroundColor Red
        exit 2
    }
    Write-Host '    Extension built successfully' -ForegroundColor Green
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
Write-Host '==> Running L3 extension Playwright suite' -ForegroundColor Cyan
$env:BOOKMARX_BASE_URL = $BaseUrl
Push-Location $repoRoot
try {
    & npx playwright test --config=playwright.extension.config.ts --reporter=list
    $tests = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($tests -ne 0) {
    Write-Host ''
    Write-Host 'L3 suite failed.' -ForegroundColor Red
    Write-Host 'Traces per test are under test-results/. Review via:'
    Write-Host '  npx playwright show-trace test-results\<spec-dir>\trace.zip'
    if (Get-Command wsh -ErrorAction SilentlyContinue) {
        & wsh notify 'BookMarx L3 extension suite FAILED — see terminal'
    }
    exit 1
}

Write-Host ''
Write-Host 'L3 extension suite passed.' -ForegroundColor Green
if (Get-Command wsh -ErrorAction SilentlyContinue) {
    & wsh notify 'BookMarx L3 extension suite: all green'
}
