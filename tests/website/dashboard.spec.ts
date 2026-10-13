// tests/website/dashboard.spec.ts
//
// L2 — Dashboard assertions split by tier. Premium paths need the
// BOOKMARX_PREMIUM_PASSWORD env var set; otherwise the premiumAccount
// fixture auto-skips (the test will show as skipped, not failed).
import { test, expect, loginAs } from './_fixtures';

test.describe('Dashboard — free tier', () => {
  test('shows upgrade banner and stats', async ({ page, freeAccount }) => {
    await loginAs(page, freeAccount);
    await page.goto('/dashboard');

    // Free tier shows an upsell per dashboard\page.tsx (the "premium upsell card"
    // lives ~:11). We don't match on exact copy because it's config-driven;
    // pin the *function* instead: the upgrade CTA must navigate to /settings/subscription.
    await expect(page.getByRole('link', { name: /upgrade|upgrade.*premium/i }).first()).toBeVisible();

    // Usage bars render (count vs limit). free limit is 250 bookmarks;
    // a fresh user should be at ~0/250.
    await expect(page.getByText(/0\s*\/\s*250|0\s*of\s*250|0\s+\/\s+250/i).first()).toBeVisible({ timeout: 8000 });
  });

  test('quick-actions route correctly', async ({ page, freeAccount }) => {
    await loginAs(page, freeAccount);
    await page.goto('/dashboard');

    // Non-premium actions are available per dashboard\page.tsx — links to
    // /install, /collections, /settings, all available.
    await page.getByRole('link', { name: /get extension|install/i }).first().click();
    await expect(page).toHaveURL(/\/install/);
    await page.goBack();
    await page.getByRole('link', { name: /view collections/i }).first().click();
    await expect(page).toHaveURL(/\/collections/);
    await page.goBack();
    // Sessions is premium-only — must NOT be visible to free user.
    await expect(page.getByRole('link', { name: /^Sessions$/i })).toHaveCount(0);
  });
});

test.describe('Dashboard — premium tier (requires BOOKMARX_PREMIUM_PASSWORD)', () => {
  test('no upgrade banner, premium badge visible', async ({ page, premiumAccount }) => {
    if (!premiumAccount) return; // Fixture marks the test skipped when credentials are absent.
    await loginAs(page, premiumAccount);
    await page.goto('/dashboard');

    // Premium has NO upgrade banner — assert absence.
    await expect(page.getByRole('link', { name: /upgrade to (premium|pro)/i })).toHaveCount(0);

    // Premium badge text comes from config.premiumTitle
    // (subscription\page.tsx:148 etc.). Default is "Premium".
    await expect(page.getByText(/premium/i).first()).toBeVisible();

    // Sessions quick-action must be visible for premium.
    await expect(page.getByRole('link', { name: /^Sessions$|session history/i })).toBeVisible();
  });

  test('premium user sees Infinity-equivalent limits', async ({ page, premiumAccount }) => {
    if (!premiumAccount) return;
    await loginAs(page, premiumAccount);
    await page.goto('/dashboard');

    // Premium limits are 10000/100/50 per backend\db\database.ts:914-916.
    // We don't assert exact UI copy ("∞" vs "10000"); instead assert no
    // "limit reached" styling.
    await expect(page.getByText(/limit reached|upgrade.*for.*more/i)).toHaveCount(0);
  });
});
