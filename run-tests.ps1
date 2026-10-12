# run-tests.ps1
#
# One-shot runner for the BookMarx API test suite. Designed to drop into a Wave
# block via `wsh run -- ./run-tests.ps1` (the block then shows pass/fail in
# place and the developer can pipe the tail to `wsh ai` for triage). The
# script intentionally does three things in sequence so the failure mode is
# legible:
#   1. Make sure better-sqlite3's native binary matches the running Node
#      version (a stale `NODE_MODULE_VERSION` mismatch is the single most
#      common cause of "vitest can't start" on this box after a Node bump).
#   2. Type-check the test tree (`npm run typecheck`) — fast signal of
#      signature drift between app and tests.
#   3. Run `npm run test`. On failure, prints the JUnit artifact path so CI
#      tooling (or `wsh ai - < test-results.junit.xml -m "triage"`) can pick
#      it up; on success, fires `wsh notify` if we're inside Wave so the
#      developer gets a green toast in a different block.
#
# Usage:
#   powershell -ExecutionPolicy Bypass -File ./run-tests.ps1 [-Fast]
#   -Fast    skip the better-sqlite3 rebuild step (assumes you've already done it)
#
# Exit codes: 0 success, 1 on test/typecheck failure.

[CmdletBinding()]
param(
    [switch]$Fast
)

$ErrorActionPreference = 'Stop'
$repoRoot = $PSScriptRoot
$website = Join-Path $repoRoot 'src/website'

function Write-Step($msg) {
    Write-Host ""
    Write-Host "==> $msg" -ForegroundColor Cyan
}

if (-not $Fast) {
    Write-Step "Rebuilding better-sqlite3 against current Node ($($(Get-Command node).Source))"
    & npm --prefix $website rebuild better-sqlite3
    if ($LASTEXITCODE -ne 0) {
        Write-Host "  rebuild failed — aborting" -ForegroundColor Red
        exit 1
    }
}

Write-Step "Type-checking tests (tsc -p tsconfig.test.json --noEmit)"
Push-Location $repoRoot
try {
    & npx tsc -p tsconfig.test.json --noEmit
    $tc = $LASTEXITCODE
} finally {
    Pop-Location
}
if ($tc -ne 0) {
    Write-Host "  typecheck failed" -ForegroundColor Red
    exit 1
}

Write-Step "Running vitest"
Push-Location $repoRoot
try {
    & npm run test
    $tests = $LASTEXITCODE
} finally {
    Pop-Location
}

if ($tests -ne 0) {
    $junit = Join-Path $repoRoot 'test-results.junit.xml'
    if (Test-Path $junit) {
        Write-Host ''
        Write-Host ("JUnit report written to: " + $junit) -ForegroundColor Yellow
        Write-Host 'Pipe it into Wave AI like:' -ForegroundColor Yellow
        Write-Host ('  Get-Content ' + $junit + ' | wsh ai -s - -m triage-these-failures')
    }
    exit 1
}

Write-Host ''
Write-Host 'All tests passed.' -ForegroundColor Green
# Toast via wsh notify if we're running inside Wave; silently no-op otherwise.
if (Get-Command wsh -ErrorAction SilentlyContinue) {
    & wsh notify 'BookMarx API suite: all tests passed'
}