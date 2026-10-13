// tests/extension/collection-switch.spec.ts
//
// L3 — Collection switching with pending changes:
//   - When the user has pending local changes and switches collection,
//     the SwitchConfirmDialog should appear.
//   - Clicking "Sync first" pushes changes then switches.
//   - Clicking "Discard changes" switches and clears the queue.
//
// Requires premium account (multiple collections needed).
// Pre-req: BOOKMARX_PREMIUM_PASSWORD must be set.

import { test, expect, openPopup, seedAuthInExtension, clearExtensionStorage, getExtensionStorage, createBookmarkViaApi, evalInBackground, apiBase, trackCollection } from './_fixtures';

test.describe('Collection switch with pending changes', () => {
  test('switching collection with pending changes shows SwitchConfirmDialog', async ({ page, premiumAccount }) => {
    test.skip(!premiumAccount, 'Requires BOOKMARX_PREMIUM_PASSWORD');
    if (!premiumAccount) return;

    // Seed auth
    await seedAuthInExtension(premiumAccount);

    // Create a bookmark to generate a pending change
    await createBookmarkViaApi('1', 'Switch Test BM', 'https://example.com/switch-test');
    await new Promise(r => setTimeout(r, 1500));

    // Verify we have pending changes
    const storage = await getExtensionStorage();
    expect(storage.changes?.length || 0).toBeGreaterThan(0);

    // Create a second collection via API for switching to
    const colResponse = await fetch(`${apiBase()}/collections`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${premiumAccount.token}`,
      },
      body: JSON.stringify({ name: 'L3 Switch Test Collection' }),
    });
    const colBody = await colResponse.json();
    console.log('[L3 collection-switch] Collection creation response:', JSON.stringify(colBody));
    if (colBody?.success && colBody?.data?.collection?.id) {
      trackCollection(colBody.data.collection.id);
    }
    const targetCollectionId = colBody?.data?.collection?.id;
    expect(targetCollectionId).toBeTruthy();

    // Open popup
    const popup = await openPopup(page);
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });

    // Wait for onboarding dialog to appear (async) and dismiss it
    const onboardingDialog = popup.locator('dialog.onboarding-dialog');
    try {
      await expect(onboardingDialog).toBeVisible({ timeout: 8000 });
      await popup.evaluate(() => {
        const dlg = document.querySelector('dialog.onboarding-dialog') as HTMLDialogElement;
        if (dlg && dlg.open) dlg.close();
      });
      await expect(onboardingDialog).not.toBeVisible({ timeout: 3000 });
    } catch {
      // Onboarding dialog didn't appear — that's fine
    }
    await new Promise(r => setTimeout(r, 500));

    // Toggle collection dropdown via evaluate to avoid click interception
    await popup.evaluate(() => {
      const trigger = document.getElementById('collectionTrigger') as HTMLButtonElement;
      if (trigger) trigger.click();
    });

    // Wait for dropdown to appear
    const dropdown = popup.locator('#collectionDropdown');
    await expect(dropdown).not.toHaveClass(/hidden/, { timeout: 5000 });

    // The dropdown should list the new collection
    const collectionOption = dropdown.locator(`[data-collection-id="${targetCollectionId}"], :has-text("L3 Switch Test Collection")`).first();
    await expect(collectionOption).toBeVisible({ timeout: 5000 });

    // Click it — this should trigger the switch with pending changes
    await collectionOption.click({ force: true });

    // SwitchConfirmDialog should appear
    const switchDialog = popup.locator('dialog.switch-confirm-dialog');
    await expect(switchDialog).toBeVisible({ timeout: 10000 });
    await expect(switchDialog.locator('.switch-confirm-header')).toContainText(/unsaved changes/i);

    // Verify both options are present
    await expect(switchDialog.locator('[data-choice="sync"]')).toBeVisible();
    await expect(switchDialog.locator('[data-choice="discard"]')).toBeVisible();

    // Click "Discard changes"
    await switchDialog.locator('[data-choice="discard"]').click();

    // Dialog should close
    await expect(switchDialog).not.toBeVisible({ timeout: 5000 });

    // Queue should be cleared after discard
    const postSwitchStorage = await getExtensionStorage();
    // After discard, changes should be empty
    await expect.poll(async () => (await getExtensionStorage()).changes?.length || 0).toBe(0);

    await popup.close();
  });

  test('switching collection with no pending changes switches silently', async ({ page, premiumAccount }) => {
    test.skip(!premiumAccount, 'Requires BOOKMARX_PREMIUM_PASSWORD');
    if (!premiumAccount) return;

    // Clear storage and re-seed (no pending changes)
    await clearExtensionStorage();
    await seedAuthInExtension(premiumAccount);

    // Open popup
    const popup = await openPopup(page);
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });

    // Wait for onboarding dialog to appear (async) and dismiss it
    const onboardingDialog = popup.locator('dialog.onboarding-dialog');
    try {
      await expect(onboardingDialog).toBeVisible({ timeout: 8000 });
      await popup.evaluate(() => {
        const dlg = document.querySelector('dialog.onboarding-dialog') as HTMLDialogElement;
        if (dlg && dlg.open) dlg.close();
      });
      await expect(onboardingDialog).not.toBeVisible({ timeout: 3000 });
    } catch {
      // Onboarding dialog didn't appear — that's fine
    }
    await new Promise(r => setTimeout(r, 500));

    // Toggle collection dropdown via evaluate to avoid click interception
    await popup.evaluate(() => {
      const trigger = document.getElementById('collectionTrigger') as HTMLButtonElement;
      if (trigger) trigger.click();
    });
    const dropdown = popup.locator('#collectionDropdown');
    await expect(dropdown).not.toHaveClass(/hidden/, { timeout: 5000 });

    // Switch back to default collection (should be listed)
    const defaultOption = dropdown.locator(':has-text("Master Collection"), [data-collection-id="default"]').first();
    await expect(defaultOption).toBeVisible({ timeout: 5000 });
    await defaultOption.click({ force: true });

    // No SwitchConfirmDialog should appear (no pending changes)
    const switchDialog = popup.locator('dialog.switch-confirm-dialog');
    // Give it a moment — dialog should NOT appear
    await new Promise(r => setTimeout(r, 2000));
    await expect(switchDialog).not.toBeVisible();

    await popup.close();
  });
});
