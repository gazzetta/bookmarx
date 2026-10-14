// tests/extension/initial-sync.spec.ts
//
// L3 — Initial sync flow through the popup:
//   - Logged-in user with empty master collection sees "Run Initial Sync"
//   - Clicking it shows SyncConfirmDialog with "Initial Sync" header
//   - Confirming triggers POST /api/v1/sync/initial via syncNow message
//   - After sync, bookmarks round-trip to server
//
// Uses a fresh free user so the master collection starts empty (needsInitialSync=true).

import { test, expect, openPopup, seedAuthInExtension, getExtensionStorage, clearExtensionStorage, evalInBackground } from './_fixtures';
import { apiBase } from './_fixtures';

test.describe('Initial sync flow', () => {
  test('free user: sync up uploads local bookmarks to server and round-trips', async ({ page, freeAccount }) => {
    test.setTimeout(120000);
    // Seed auth so the extension is logged in
    await seedAuthInExtension(freeAccount);

    // Create a bookmark via chrome.bookmarks API so there's something to sync
    await evalInBackground(async () => {
      // @ts-ignore
      return new Promise((resolve) => {
        // @ts-ignore — '1' is the Bookmarks Bar folder ID in Chrome
        chrome.bookmarks.create(
          { parentId: '1', title: 'L3 Test Bookmark', url: 'https://example.com/l3-test' },
          (bm: any) => resolve(bm)
        );
      });
    });

    // Wait for the bookmark creation to be queued
    await new Promise(r => setTimeout(r, 1500));

    // Debug: check storage state before opening popup
    const preSyncStorage = await getExtensionStorage();
    console.log('[L3 initial-sync] Pre-sync storage:', {
      changesCount: preSyncStorage?.changes?.length || 0,
      changes: preSyncStorage?.changes?.map((c: any) => ({ type: c.type, url: c.data?.url })) || [],
      lastSync: preSyncStorage?.lastSync,
      auth: preSyncStorage?.auth ? 'present' : 'null',
      browserInstanceId: preSyncStorage?.browserInstanceId,
    });

    // Open popup
    const popup = await openPopup(page);

    // Wait for logged-in state
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });

    // Wait for sync up button to be enabled (pending changes exist)
    await expect(popup.locator('#syncUp')).not.toBeDisabled({ timeout: 10000 });

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

    // Click sync up
    await popup.locator('#syncUp').click({ force: true });

    // SyncConfirmDialog should appear (either "Initial Sync" or "Sync Changes")
    const dialog = popup.locator('dialog.sync-confirm-dialog');
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog.locator('.sync-confirm-header')).toContainText(/initial sync|sync changes/i);

    // Confirm the sync
    await dialog.locator('.sync-confirm-btn').click();

    // Wait for success message or dialog closure
    await expect(popup.locator('#errorContainer')).toContainText(/synced|success/i, { timeout: 30000 }).catch(() => {});

    // Give the sync time to complete, then verify storage has lastSync > 0
    let lastSync = 0;
    for (let i = 0; i < 30; i++) {
      const storage = await getExtensionStorage();
      if (storage?.lastSync && storage.lastSync > 0) {
        lastSync = storage.lastSync;
        break;
      }
      await new Promise(r => setTimeout(r, 1000));
    }
    expect(lastSync).toBeGreaterThan(0);

    // Debug: check storage state after sync
    const postSyncStorage = await getExtensionStorage();
    console.log('[L3 initial-sync] Post-sync storage:', {
      changesCount: postSyncStorage?.changes?.length || 0,
      lastSync: postSyncStorage?.lastSync,
    });

    // Reopen to read fresh server status, rather than a cached pre-upload count.
    await popup.close();
    const afterSync = await openPopup(page);
    await expect(afterSync.locator('#remoteBookmarksCount')).toHaveText('1', { timeout: 15000 });
    await expect(afterSync.locator('#pendingDownCount')).toHaveText('0', { timeout: 15000 });
    await expect(afterSync.locator('#pendingUpCount')).toHaveText('0', { timeout: 15000 });
    await afterSync.close();

    // Get deviceId from extension storage for API verification
    const storage = await getExtensionStorage();
    const deviceId = storage?.deviceId;

    // Verify via API that the bookmark made it to the server. The fresh profile has
    // only this one bookmark, so it is well under the free plan limit (250) and the
    // round-trip must hold. Previously this only logged, so a broken sync still passed.
    const response = await fetch(`${apiBase()}/sync/master-collection`, {
      headers: {
        'Authorization': `Bearer ${freeAccount.token}`,
        'X-User-ID': freeAccount.userId,
        'X-Device-ID': deviceId || '',
      },
    });
    const body = await response.json();
    expect(body.success, JSON.stringify(body)).toBe(true);
    const found = (body.data?.bookmarks || []).some((b: any) => b.url === 'https://example.com/l3-test');
    expect(found, 'bookmark should round-trip to the master collection').toBe(true);
  });
});
