# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: browsers.spec.ts >> Manage browsers page — free tier >> browser count stays 0 after refreshing page
- Location: tests\website\browsers.spec.ts:31:7

# Error details

```
Test timeout of 30000ms exceeded.
```

```
Error: page.reload: Test timeout of 30000ms exceeded.
```

# Test source

```ts
  1  | // tests/website/browsers.spec.ts
  2  | //
  3  | // L2 — Browser management page /settings/browsers.
  4  | // We do NOT register actual browsers (that needs the extension); we verify
  5  | // the page renders, shows the zero-state honestly, and exposes the upgrade
  6  | // link near limit. Per TESTING-REGIME.md, we hit the real dev DB so we must
  7  | // NOT mutate the user's existing browsers — `qa@bookmarx.cc` already
  8  | // has 4 connected per the QA checklist.
  9  | import { test, expect, loginAs, apiBase, trackBrowser } from './_fixtures';
  10 | 
  11 | test.describe('Manage browsers page — free tier', () => {
  12 |   test('renders with 0 browsers for brand-new free user + shows limit', async ({ page, freeAccount }) => {
  13 |     await loginAs(page, freeAccount);
  14 |     await page.goto('/settings/browsers');
  15 | 
  16 |     // Page header per settings\browsers\page.tsx:20. The heading "Manage
  17 |     // Browsers" is unique on the h1; the "No browsers connected" text lives
  18 |     // in a separate h3 — use exact match to avoid the strict-mode violation.
  19 |     await expect(page.getByRole('heading', { name: 'Manage Browsers', exact: true })).toBeVisible();
  20 | 
  21 |     // A fresh free user has 0 browsers registered (we never went near the
  22 |     // extension). Slot count "0 / 2" must be visible somewhere.
  23 |     await expect(page.getByText(/0\s*\/\s*2|0\s+of\s+2/i).first()).toBeVisible({ timeout: 10_000 });
  24 | 
  25 |     // The "Disconnect" button must NOT be present when 0 browsers (because
  26 |     // there's nothing to disconnect). Asserting this catches the case where
  27 |     // the page forgot to gate.
  28 |     await expect(page.getByRole('button', { name: /disconnect|remove/i })).toHaveCount(0);
  29 |   });
  30 | 
  31 |   test('browser count stays 0 after refreshing page', async ({ page, freeAccount }) => {
  32 |     await loginAs(page, freeAccount);
  33 |     await page.goto('/settings/browsers');
  34 |     await expect(page.getByText(/0\s*\/\s*2/i).first()).toBeVisible();
> 35 |     await page.reload();
     |                ^ Error: page.reload: Test timeout of 30000ms exceeded.
  36 |     await expect(page.getByText(/0\s*\/\s*2/i).first()).toBeVisible();
  37 |   });
  38 | });
  39 | 
  40 | // Premium tier browser-management smoke: just confirm the page renders with
  41 | // premium context and shows no upgrade prompt. Does NOT delete or rename
  42 | // any of the user's real connected browsers (per TESTING-REGIME.md the
  43 | // user's data is sacred; we only read).
  44 | test.describe('Manage browsers page — premium tier (read-only, requires BOOKMARX_PREMIUM_PASSWORD)', () => {
  45 |   test('renders without upgrade prompt and lists current browsers', async ({ page, premiumAccount }) => {
  46 |     if (!premiumAccount) {
  47 |       test.skip(true, 'Requires BOOKMARX_PREMIUM_PASSWORD');
  48 |       return;
  49 |     }
  50 |     const instanceId = crypto.randomUUID();
  51 |     const registration = await fetch(`${apiBase()}/sync/master-collection`, { headers: {
  52 |       Authorization: `Bearer ${premiumAccount.token}`, 'X-Device-ID': crypto.randomUUID(), 'X-Browser-Instance-ID': instanceId,
  53 |     }});
  54 |     expect(registration.status).toBe(200);
  55 |     trackBrowser(instanceId);
  56 |     await loginAs(page, premiumAccount);
  57 |     await page.goto('/settings/browsers');
  58 | 
  59 |     // Page renders, no upgrade CTA visible because premium is over the
  60 |     // browser-limit threshold anyway.
  61 |     await expect(page.getByRole('heading', { name: 'Manage Browsers', exact: true })).toBeVisible();
  62 |     // The user has 4 browsers per the QA baseline; assert at least one
  63 |     // browser row renders a "Disconnect" button.
  64 |     const disconnectButtons = page.getByRole('button', { name: /disconnect|remove/i });
  65 |     expect(await disconnectButtons.count()).toBeGreaterThanOrEqual(1);
  66 | 
  67 |     // No upgrade prompt for premium.
  68 |     await expect(page.getByText(/upgrade to .*for more browsers|you.ve reached.*limit.*browsers/i)).toHaveCount(0);
  69 |   });
  70 | });
  71 | 
```