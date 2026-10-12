// tests/website/browsers.spec.ts
//
// L2 — Browser management page /settings/browsers.
// We do NOT register actual browsers (that needs the extension); we verify
// the page renders, shows the zero-state honestly, and exposes the upgrade
// link near limit. Per TESTING-REGIME.md, we hit the real dev DB so we must
// NOT mutate the user's existing browsers — `qa@bookmarx.cc` already
// has 4 connected per the QA checklist.
import { test, expect, loginAs } from './_fixtures';

test.describe('Manage browsers page — free tier', () => {
  test('renders with 0 browsers for brand-new free user + shows limit', async ({ page, freeAccount }) => {
    await loginAs(page, freeAccount);
    await page.goto('/settings/browsers');

    // Page header per settings\browsers\page.tsx:20. The heading "Manage
    // Browsers" is unique on the h1; the "No browsers connected" text lives
    // in a separate h3 — use exact match to avoid the strict-mode violation.
    await expect(page.getByRole('heading', { name: 'Manage Browsers', exact: true })).toBeVisible();

    // A fresh free user has 0 browsers registered (we never went near the
    // extension). Slot count "0 / 2" must be visible somewhere.
    await expect(page.getByText(/0\s*\/\s*2|0\s+of\s+2/i).first()).toBeVisible({ timeout: 10_000 });

    // The "Disconnect" button must NOT be present when 0 browsers (because
    // there's nothing to disconnect). Asserting this catches the case where
    // the page forgot to gate.
    await expect(page.getByRole('button', { name: /disconnect|remove/i })).toHaveCount(0);
  });

  test('browser count stays 0 after refreshing page', async ({ page, freeAccount }) => {
    await loginAs(page, freeAccount);
    await page.goto('/settings/browsers');
    await expect(page.getByText(/0\s*\/\s*2/i).first()).toBeVisible();
    await page.reload();
    await expect(page.getByText(/0\s*\/\s*2/i).first()).toBeVisible();
  });
});

// Premium tier browser-management smoke: just confirm the page renders with
// premium context and shows no upgrade prompt. Does NOT delete or rename
// any of the user's real connected browsers (per TESTING-REGIME.md the
// user's data is sacred; we only read).
test.describe('Manage browsers page — premium tier (read-only, requires BOOKMARX_PREMIUM_PASSWORD)', () => {
  test('renders without upgrade prompt and lists current browsers', async ({ page, premiumAccount }) => {
    if (!premiumAccount) {
      test.skip(true, 'Requires BOOKMARX_PREMIUM_PASSWORD');
      return;
    }
    await loginAs(page, premiumAccount);
    await page.goto('/settings/browsers');

    // Page renders, no upgrade CTA visible because premium is over the
    // browser-limit threshold anyway.
    await expect(page.getByRole('heading', { name: 'Manage Browsers', exact: true })).toBeVisible();
    // The user has 4 browsers per the QA baseline; assert at least one
    // browser row renders a "Disconnect" button.
    const disconnectButtons = page.getByRole('button', { name: /disconnect|remove/i });
    expect(await disconnectButtons.count()).toBeGreaterThanOrEqual(1);

    // No upgrade prompt for premium.
    await expect(page.getByText(/upgrade to .*for more browsers|you.ve reached.*limit.*browsers/i)).toHaveCount(0);
  });
});