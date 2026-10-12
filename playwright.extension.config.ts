// playwright.extension.config.ts
//
// L3 — BookMarx Extension Playwright config.
//
// Loads the real built extension (src/extension/dist) into a persistent
// Chromium context via --load-extension. Drives popup, master-collection
// page, and background service worker through Playwright + CDP.
//
// Pre-flight:
//   1. Build extension:  cd src/extension; npm run build:chrome
//   2. Start API+website: cd src/website; npm run dev  (port 3005)
//   3. Run: npx playwright test --config=playwright.extension.config.ts

import { defineConfig } from '@playwright/test';
import * as path from 'path';

const extensionDir = path.resolve(__dirname, 'src/extension/dist');
const baseURL = process.env.BOOKMARX_BASE_URL ?? 'http://localhost:3005';

export default defineConfig({
  testDir: './tests/extension',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: process.env.CI ? [['github'], ['junit', { outputFile: 'playwright-extension-results.xml' }]] : 'list',
  use: {
    baseURL,
    headless: false,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Extension loading requires --load-extension which only works in
    // non-headless mode. We use launchPersistentContext via the fixture.
  },
  projects: [
    {
      name: 'chromium-extension',
      use: {
        // These are read by the fixture to construct the persistent context.
        // Playwright's default device config is overridden by our fixture.
        channel: 'chromium',
      },
    },
  ],
});
