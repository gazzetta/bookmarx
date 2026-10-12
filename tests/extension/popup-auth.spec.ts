// tests/extension/popup-auth.spec.ts
//
// L3 — Extension popup authentication flow:
//   - Popup opens in logged-out state
//   - Email login against dev API succeeds
//   - Popup shows user email + tier badge
//   - Logout clears chrome.storage.local.auth

import { test, expect, openPopup, getExtensionStorage, clearExtensionStorage } from './_fixtures';

test.describe('Popup authentication', () => {
  test('popup opens in logged-out state', async ({ page, freeAccount }) => {
    const popup = await openPopup(page);
    // Logged-out view should be visible
    await expect(popup.locator('#authLoggedOut')).toBeVisible();
    await expect(popup.locator('#authLoggedIn')).not.toBeVisible();
    // Login form elements present
    await expect(popup.locator('#emailInput')).toBeVisible();
    await expect(popup.locator('#passwordInput')).toBeVisible();
    await expect(popup.locator('#emailLogin')).toBeVisible();
    await popup.close();
  });

  test('email login succeeds and shows user email', async ({ page, freeAccount }) => {
    const popup = await openPopup(page);

    // Fill login form
    await popup.locator('#emailInput').fill(freeAccount.email);
    await popup.locator('#passwordInput').fill(freeAccount.password);
    await popup.locator('#emailLogin').click();

    // Should transition to logged-in state
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });
    await expect(popup.locator('#authLoggedOut')).not.toBeVisible();
    await expect(popup.locator('#authUserEmail')).toContainText(freeAccount.email);

    await popup.close();
  });

  test('tier badge shows "Free" for free user', async ({ page, freeAccount }) => {
    // Seed auth directly for a clean state
    const popup = await openPopup(page);

    // Login first
    await popup.locator('#emailInput').fill(freeAccount.email);
    await popup.locator('#passwordInput').fill(freeAccount.password);
    await popup.locator('#emailLogin').click();

    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });
    const tierBadge = popup.locator('#tierBadge');
    await expect(tierBadge).toContainText('Free');
    await expect(tierBadge).toHaveClass(/tier-free/);

    await popup.close();
  });

  test('logout clears auth from chrome.storage.local', async ({ page, freeAccount }) => {
    const popup = await openPopup(page);

    // Login first
    await popup.locator('#emailInput').fill(freeAccount.email);
    await popup.locator('#passwordInput').fill(freeAccount.password);
    await popup.locator('#emailLogin').click();
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });

    // Click logout
    await popup.locator('#logout').click();

    // Should transition back to logged-out
    await expect(popup.locator('#authLoggedOut')).toBeVisible({ timeout: 5000 });
    await expect(popup.locator('#authLoggedIn')).not.toBeVisible();

    // Verify storage is cleared
    const storage = await getExtensionStorage();
    expect(storage.auth).toBeNull();

    await popup.close();
  });

  test('login with wrong password shows error', async ({ page, freeAccount }) => {
    const popup = await openPopup(page);

    await popup.locator('#emailInput').fill(freeAccount.email);
    await popup.locator('#passwordInput').fill('WrongPassword!123');
    await popup.locator('#emailLogin').click();

    // Error toast should appear
    await expect(popup.locator('#errorContainer')).not.toHaveClass(/hidden/);

    await popup.close();
  });
});
