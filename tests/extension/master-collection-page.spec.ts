// tests/extension/master-collection-page.spec.ts
//
// L3 — Master collection extension page:
//   - chrome-extension://<id>/pages/master-collection.html loads
//   - Tree renders with bookmark nodes from the server
//   - Premium user sees "Edit in Web" link pointing at WEBSITE_BASE_URL/collections/default/edit
//   - Free user sees "Upgrade to Edit" link

import { test, expect, getExtensionPage, seedAuthInExtension, clearExtensionStorage, getExtensionId } from './_fixtures';

test.describe('Master collection page', () => {
  test('page loads and shows user info', async ({ page, freeAccount }) => {
    // Seed auth and do a quick initial sync so there's data to show
    await seedAuthInExtension(freeAccount);

    // Create a bookmark and sync so the master collection isn't empty
    const { evalInBackground } = await import('./_fixtures');
    await evalInBackground(async () => {
      // @ts-ignore
      return new Promise((resolve) => {
        // @ts-ignore
        chrome.bookmarks.create(
          { parentId: '1', title: 'MC Page Test', url: 'https://example.com/mc-page' },
          (bm: any) => resolve(bm)
        );
      });
    });
    await new Promise(r => setTimeout(r, 1500));

    // Trigger sync
    await evalInBackground(async () => {
      // @ts-ignore
      return new Promise((resolve) => {
        // @ts-ignore
        chrome.runtime.sendMessage({ action: 'syncNow' }, (resp: any) => resolve(resp));
      });
    });
    await new Promise(r => setTimeout(r, 5000));

    // Open the master collection page
    const mcPage = await getExtensionPage(page, 'pages/master-collection.html');

    // Wait for user info to render
    await expect(mcPage.locator('#user-info')).not.toBeEmpty({ timeout: 10000 });

    // Should contain the user's email
    await expect(mcPage.locator('#user-info')).toContainText(freeAccount.email);

    await mcPage.close();
  });

  test('free user sees "Upgrade to Edit" link', async ({ page, freeAccount }) => {
    await seedAuthInExtension(freeAccount);

    const mcPage = await getExtensionPage(page, 'pages/master-collection.html');
    await expect(mcPage.locator('#user-info')).not.toBeEmpty({ timeout: 10000 });

    // Free user should see upgrade link, not edit link
    await expect(mcPage.locator('#user-info')).toContainText(/upgrade/i);

    await mcPage.close();
  });

  test('premium user sees "Edit in Web" link', async ({ page, premiumAccount }) => {
    test.skip(!premiumAccount, 'Requires BOOKMARX_PREMIUM_PASSWORD');
    if (!premiumAccount) return;

    // Clear any stale auth from previous tests
    await clearExtensionStorage();
    await seedAuthInExtension(premiumAccount);

    // Wait a moment for storage to settle
    await new Promise(r => setTimeout(r, 1000));

    const mcPage = await getExtensionPage(page, 'pages/master-collection.html');

    // Wait for user info to render with longer timeout
    await expect(mcPage.locator('#user-info')).not.toBeEmpty({ timeout: 20000 });

    // Premium user should see "Edit in Web" link
    const editLink = mcPage.locator('#user-info a:has-text("Edit in Web")');
    await expect(editLink).toBeVisible();
    const href = await editLink.getAttribute('href');
    expect(href).toContain('/collections/default/edit');

    await mcPage.close();
  });

  test('bookmark tree renders nodes from server', async ({ page, premiumAccount }) => {
    test.skip(!premiumAccount, 'Requires BOOKMARX_PREMIUM_PASSWORD');
    if (!premiumAccount) return;

    // Clear any stale auth from previous tests
    await clearExtensionStorage();
    await seedAuthInExtension(premiumAccount);

    const mcPage = await getExtensionPage(page, 'pages/master-collection.html');

    // Wait for tree to render — the premium user has 435 bookmarks
    // so the tree container should have content
    await expect(mcPage.locator('#bookmarkTree')).not.toBeEmpty({ timeout: 15000 });

    // Should have some tree nodes (folders/bookmarks)
    const treeItems = mcPage.locator('#bookmarkTree .bookmark, #bookmarkTree .folder');
    const count = await treeItems.count();
    expect(count).toBeGreaterThan(0);

    await mcPage.close();
  });
});
