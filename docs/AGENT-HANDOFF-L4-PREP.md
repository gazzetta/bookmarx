# Agent Handoff — L4 Extension Suite Prep Complete

## Project: BookMarx
**Working directory:** `C:\CODING\bookmarx`
**OS:** Windows 10, PowerShell only (no bash/cmd)
**Dev server:** `http://localhost:3005` (unified Next.js + API from `src/website/server.ts`)

---

## What Was Done This Session

### 1. L2 Dashboard Premium Badge Test — FIXED (25/25 passing)
**Root cause:** The dashboard page had no "Sessions" quick-action link. The test expected premium users to see a Sessions link, but the dashboard only had Edit Collection, Restore Points, and Subscription.

**Fix:** Added a "Sessions" quick-action link to `src/website/app/dashboard/page.tsx` for premium users (links to `/sessions`), with a locked card for free users matching the existing pattern.

**Result:** `npx playwright test --config=playwright.website.config.ts` → 25/25 passing

### 2. Hard-Coded Upgrade URLs — FIXED
**Root cause:** `popup/index.ts:810` and `SyncManager.ts:383/393/401` had hard-coded `https://www.bookmarx.cc/upgrade` instead of using `WEBSITE_BASE_URL` from config.

**Fix:** 
- `popup/index.ts` — imported `WEBSITE_BASE_URL`, replaced 2 hard-coded URLs with `${WEBSITE_BASE_URL}/upgrade`
- `SyncManager.ts` — imported `WEBSITE_BASE_URL`, replaced 3 hard-coded URLs with `${WEBSITE_BASE_URL}/upgrade`

### 3. L3 Onboarding Flaky Test — FIXED (23/23 passing)
**Root cause:** Second onboarding test used `clearExtensionStorage()` which wiped `browserInstanceId` and `deviceId`, breaking the `getSyncStatus` API call. Additionally, the popup's async `updateUI()` hadn't finished reading `chrome.storage.local` by the time the test checked auth state.

**Fix:**
- Replaced `clearExtensionStorage()` with targeted `lastSync: 0` reset + `seedAuthInExtension()` re-seed
- Added `popup.reload()` + `waitForLoadState('domcontentloaded')` before auth checks to ensure `updateUI()` re-reads storage

### 4. Firefox Extension Built
- `npm run build:firefox` → `src/extension/dist-firefox/manifest.json` exists and ready for L4

### 5. L5 Edge-Case Tests Added (13 new tests)
- `tests/api/edge-cases.test.ts` — covers unicode/special chars, large bookmark trees (200+), JWT rejection variants, concurrent UPDATE from 2 devices, empty titles, very long URLs/titles
- L1 suite now 50/50 passing
- Updated `docs/TESTING-REGIME.md` L5 coverage table and release gate checklist

### 6. L4 Runbook Fixes
- Fixed stale port `localhost:3006` → `localhost:3005` in HUMAN ACTION 6
- Updated HUMAN ACTION 8 to reflect upgrade URL fix (now config-driven)
- Updated release gate L1 count to 50

---

## Current Test Status (All Layers)

| Layer | Status | Details |
|---|---|---|
| **L1 — Vitest API** | 50/50 passing | `npm test` from repo root (37 original + 13 new edge-case tests) |
| **L2 — Website Playwright** | 25/25 passing | All green including premium badge test |
| **L3 — Extension Playwright** | 23/23 passing | All green including onboarding cancel test |
| **L4 — Multi-browser human** | Ready to begin | Firefox extension built, Chrome extension rebuilt, runbook updated |
| **L5 — Edge cases** | Automatable done | 13 new tests: unicode, large tree, JWT variants, concurrent UPDATE, edge inputs |

---

## L4 Setup Instructions (for human)

### Required setup before L4 begins
1. **Chrome extension:** `chrome://extensions` → Developer mode → Load unpacked → `src/extension/dist`
2. **Firefox extension:** `about:debugging` → This Firefox → Load temporary Add-on → `src/extension/dist-firefox/manifest.json`
3. **Dev server:** Must be running on `http://localhost:3005`
4. **Sign in** to extension in both browsers as `qa@bookmarx.cc` / `bo24618769X.`

### L4 Human Actions (see TESTING-REGIME.md section 6)
- HUMAN ACTION 1–10 cover: initial sync, native star, cross-device MOVE/DELETE, notifications, web editor propagation, session rollback, free-tier browser cap, Google OAuth, PayPal migration

---

## Known Issues Still Open

### 1. Two different Google OAuth2 client_ids (L4 ACTION 9)
- `manifest.json:15` → `669480413219-orsc4922bls6jir2thbslsssi6p0tkjg.apps.googleusercontent.com`
- `background/index.ts:167` → `669480413219-sv4vq2de70at057ra24jis15bftota8g.apps.googleusercontent.com`
- If L4 ACTION 9 fails with audience mismatch, this is the cause

### 2. Alarm interval is 0.5 min (QA temp)
- `background/index.ts:13-15` — should revert to 5 min after L4 testing completes

### 3. PayPal Migration (BLOCKING for subscription tests)
- HUMAN ACTION 10 — codebase migrating from Polar to PayPal Advanced Payments
- Do NOT build subscription/checkout tests until PayPal is wired

### 4. `getGoogleAccessToken` is dead code
- `popup/index.ts:1205-1215` — don't test against it

---

## Key Files Modified This Session

| File | Change |
|---|---|
| `src/website/app/dashboard/page.tsx` | Added Sessions quick-action link for premium/locked for free |
| `src/extension/popup/index.ts` | Replaced hard-coded upgrade URLs with `WEBSITE_BASE_URL` |
| `src/extension/background/SyncManager.ts` | Replaced hard-coded upgrade URLs with `WEBSITE_BASE_URL` |
| `tests/extension/onboarding.spec.ts` | Fixed flaky test: lastSync reset + popup reload |
| `tests/api/edge-cases.test.ts` | **NEW** — 13 L5 edge-case tests (unicode, large tree, JWT, concurrent, edge inputs) |
| `docs/TESTING-REGIME.md` | Updated L5 coverage table, release gate count, L4 runbook port fix |

---

## How to Run Tests

```powershell
# L1 — Vitest API
cd 'c:\CODING\bookmarx'; npm test

# L2 — Website Playwright
$env:BOOKMARX_PREMIUM_PASSWORD = 'bo24618769X.'
npx playwright test --config=playwright.website.config.ts --reporter=list

# L3 — Extension Playwright
$env:BOOKMARX_PREMIUM_PASSWORD = 'bo24618769X.'
npx playwright test --config=playwright.extension.config.ts --reporter=list

# Or use runner scripts (auto-loads .env.local)
pwsh -ExecutionPolicy Bypass -File .\run-l2-website.ps1
pwsh -ExecutionPolicy Bypass -File .\run-l3-extension.ps1
```
