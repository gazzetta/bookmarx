// playwright.website.config.ts
//
// L2 — BookMarx Website Playwright config.
//
// Scope: drives the real Next.js + API unified server running at
// http://localhost:3005 (started by `npm run dev` in src/website). Does NOT
// mock anything web-level; this is end-to-end through the actual server.
//
// Per-test cleanup against the real dev DB: see tests/website/_fixtures.ts.
//
// Run:
//   npx playwright test --config=playwright.website.config.ts
//
// Note: subscription / checkout spec is intentionally DEFERRED — see
// docs/TESTING-REGIME.md HUMAN ACTION 10 (PayPal migration blocking).

import { defineConfig, devices } from '@playwright/test';

const baseURL = process.env.BOOKMARX_BASE_URL ?? 'http://localhost:3005';

export default defineConfig({
  testDir: './tests/website',
  fullyParallel: false,
  // Single worker: we're hitting the real dev DB (per TESTING-REGIME.md the
  // user opted for per-test cleanup against the shared database). Parallel
  // workers would race on user registrations and foul each other's state.
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['junit', { outputFile: 'playwright-website-results.xml' }]] : 'list',
  use: {
    baseURL,
    headless: true,
    ignoreHTTPSErrors: true,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Fail loud on any console error during a test — BookMarx's Next.js
    // hydration is quiet when healthy; a stray exception is worth a red.
    console: 'error',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // No webServer hook: we don't start the dev server from Playwright (the
  // user runs it in a separate Wave block so they can watch logs alongside
  // test output). If /health doesn't respond, the first test fails loudly
  // with a clear "API not running" message via the fixture's pre-flight.
});