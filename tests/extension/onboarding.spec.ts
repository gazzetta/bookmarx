// tests/extension/onboarding.spec.ts
//
// L3 — Onboarding dialog flow:
//   - When a logged-in user has never synced AND the master collection
//     already has bookmarks, the OnboardingDialog should appear.
//   - The dialog shows master vs local bookmark counts.
//   - Clicking "Overwrite Local" triggers the overwriteFromMaster flow.
//
// This test uses the premium account (qa@bookmarx.cc) because:
//   1. The premium user already has a populated master collection (435 bookmarks)
//   2. A fresh browser instance has never synced → triggers onboarding
//
// Pre-req: BOOKMARX_PREMIUM_PASSWORD must be set.

import { test, expect, openPopup, seedAuthInExtension, evalInBackground, getExtensionStorage } from './_fixtures';

test.describe('Onboarding dialog', () => {
  test('premium user with existing master sees onboarding dialog', async ({ page, premiumAccount }) => {
    test.skip(!premiumAccount, 'Requires BOOKMARX_PREMIUM_PASSWORD');
    if (!premiumAccount) return;

    // Seed auth — this user has a populated master collection
    await seedAuthInExtension(premiumAccount);

    // Open popup — should trigger checkOnboardingNeeded()
    const popup = await openPopup(page);
    // Reload to ensure updateUI() re-reads storage after service worker is ready
    await popup.reload();
    await popup.waitForLoadState('domcontentloaded');

    // Wait for logged-in state
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 15000 });

    // The onboarding dialog should appear (master has bookmarks, local never synced)
    const dialog = popup.locator('dialog.onboarding-dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Verify it shows master collection stats
    await expect(dialog.locator('.onboarding-header')).toContainText(/setup.*bookmark/i);
    await expect(dialog.locator('.onboarding-stat-group')).toHaveCount(2); // master + local

    // Verify "Overwrite Local" option card exists (OnboardingDialog renders options as data-choice cards)
    await expect(dialog.locator('[data-choice="overwrite"]')).toBeVisible();
    // Verify "Merge Into Master then Overwrite Local" option card exists
    await expect(dialog.locator('[data-choice="mergeThenOverwrite"]')).toBeVisible();

    await popup.close();
  });

  test('clicking cancel closes onboarding dialog', async ({ page, premiumAccount }) => {
    test.skip(!premiumAccount, 'Requires BOOKMARX_PREMIUM_PASSWORD');
    if (!premiumAccount) return;

    // Reset lastSync to 0 and re-seed auth to re-trigger onboarding check.
    // Don't clear all storage — that would wipe browserInstanceId/deviceId
    // and break the getSyncStatus API call.
    await seedAuthInExtension(premiumAccount);
    await evalInBackground(async () => {
      // @ts-ignore
      return new Promise<void>((resolve) => {
        // @ts-ignore
        chrome.storage.local.set({ lastSync: 0 }, () => resolve());
      });
    });

    const popup = await openPopup(page);
    // Reload to ensure updateUI() re-reads storage after service worker is ready
    await popup.reload();
    await popup.waitForLoadState('domcontentloaded');
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 15000 });

    const dialog = popup.locator('dialog.onboarding-dialog');
    await expect(dialog).toBeVisible({ timeout: 15000 });

    // Click cancel
    await dialog.locator('.onboarding-cancel-btn').click();

    // Dialog should close
    await expect(dialog).not.toBeVisible({ timeout: 5000 });

    await popup.close();
  });
});
