// tests/extension/pending-changes.spec.ts
//
// L3 — Pending changes queueing:
//   - When a bookmark is created via chrome.bookmarks API, the
//     BookmarkManager.handleBookmarkCreated listener should queue a CREATE change.
//   - The popup should show the pending-up count incremented.
//   - This tests the core bookmark listener → queue pipeline.
//
// Workaround for "no star button": we use chrome.bookmarks.create() via
// the service worker's evaluate context (per TESTING-REGIME.md §5).

import { test, expect, openPopup, seedAuthInExtension, clearExtensionStorage, getExtensionStorage, createBookmarkViaApi, evalInBackground } from './_fixtures';

test.describe('Pending changes queueing', () => {
  test('bookmark create queues a CREATE change in chrome.storage.local', async ({ page, freeAccount }) => {
    // Seed auth so the extension knows who we are
    await seedAuthInExtension(freeAccount);

    // Get initial queue count
    const initialStorage = await getExtensionStorage();
    const initialCount = initialStorage?.changes?.length || 0;

    // Create a bookmark via chrome.bookmarks API (simulates star button)
    const bookmarkId = await createBookmarkViaApi('1', 'Pending Test BM', 'https://example.com/pending-test');
    expect(bookmarkId).toBeTruthy();

    // Wait for the BookmarkManager listener to process and queue
    let queueLength = 0;
    for (let i = 0; i < 20; i++) {
      const storage = await getExtensionStorage();
      queueLength = storage?.changes?.length || 0;
      if (queueLength > initialCount) break;
      await new Promise(r => setTimeout(r, 500));
    }

    expect(queueLength).toBeGreaterThan(initialCount);

    // Verify the queued change is a CREATE
    const storage = await getExtensionStorage();
    const lastChange = storage.changes[storage.changes.length - 1];
    expect(lastChange.type).toBe('CREATE');
    expect(lastChange.data.browserId).toBe(bookmarkId);
    expect(lastChange.data.url).toBe('https://example.com/pending-test');
  });

  test('popup shows pending-up count after bookmark creation', async ({ page, freeAccount }) => {
    // We already have at least one queued change from the previous test.
    // But we need a fresh popup to see the updated count.
    await seedAuthInExtension(freeAccount);

    // Create another bookmark to ensure there's a pending change
    await createBookmarkViaApi('1', 'Popup Count Test', 'https://example.com/popup-count');

    // Wait for queue to update
    await new Promise(r => setTimeout(r, 1500));

    const popup = await openPopup(page);
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });

    // Wait for the pending-up count to update (updateUI is async, calls getSyncStatus)
    // The background handler reads queued changes from chrome.storage.local
    await expect(popup.locator('#pendingUpCount')).not.toHaveText('0', { timeout: 10000 });
    const pendingUpText = await popup.locator('#pendingUpCount').textContent();
    const pendingUp = parseInt(pendingUpText || '0', 10);
    expect(pendingUp).toBeGreaterThan(0);

    await popup.close();
  });

  test('sync up button is enabled when there are pending changes', async ({ page, freeAccount }) => {
    await seedAuthInExtension(freeAccount);

    // Ensure there's a pending change
    await createBookmarkViaApi('1', 'Button State Test', 'https://example.com/button-state');
    await new Promise(r => setTimeout(r, 1500));

    const popup = await openPopup(page);
    await expect(popup.locator('#authLoggedIn')).toBeVisible({ timeout: 10000 });

    // Sync up button should be enabled (not disabled) when there are pending changes
    // Note: it might take a moment for the popup to fetch sync status
    await expect(popup.locator('#syncUp')).not.toBeDisabled({ timeout: 10000 });

    await popup.close();
  });

  test('bookmark delete queues a DELETE change', async ({ page, freeAccount }) => {
    await seedAuthInExtension(freeAccount);

    // First create a bookmark to delete
    const bookmarkId = await createBookmarkViaApi('1', 'Delete Me', 'https://example.com/delete-me');
    expect(bookmarkId).toBeTruthy();

    // Wait for CREATE to be queued
    await new Promise(r => setTimeout(r, 1000));

    const beforeDelete = await getExtensionStorage();
    const beforeCount = beforeDelete?.changes?.length || 0;

    // Delete the bookmark via chrome.bookmarks API
    await evalInBackground(async (id: string) => {
      // @ts-ignore
      return new Promise((resolve) => {
        // @ts-ignore
        chrome.bookmarks.remove(id, () => resolve(true));
      });
    }, bookmarkId);

    // Wait for DELETE to be queued
    let queueLength = 0;
    for (let i = 0; i < 20; i++) {
      const storage = await getExtensionStorage();
      queueLength = storage?.changes?.length || 0;
      if (queueLength > beforeCount) break;
      await new Promise(r => setTimeout(r, 500));
    }

    expect(queueLength).toBeGreaterThan(beforeCount);

    const storage = await getExtensionStorage();
    const lastChange = storage.changes[storage.changes.length - 1];
    expect(lastChange.type).toBe('DELETE');
  });
});
