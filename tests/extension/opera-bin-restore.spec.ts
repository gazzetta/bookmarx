import { test, expect } from '@playwright/test';
import { registerFreeUser } from './_fixtures';
import { launchPeer, seedAuth, sendFromPopup, createFolder, createBookmark, findLocalByUrl, inBackground,
  getStorage, retirePeer, waitFor, serverUrls, type Peer } from './_peers';

declare const chrome: any;

test('real Opera: restoring a folder from Bin restores its full subtree across browsers', async () => {
  test.setTimeout(180000);
  const account = await registerFreeUser();
  let opera: Peer | null = null;
  let other: Peer | null = null;
  try {
    opera = await launchPeer('opera-bin-restore-a', 'opera');
    other = await launchPeer('opera-bin-restore-b');
    await seedAuth(opera, account);
    await seedAuth(other, account);

    const roots = await inBackground<{ binId: string | null; barId: string | null }>(opera, () => new Promise(resolve => {
      chrome.bookmarks.getTree((tree: any[]) => {
        const children = tree[0].children || [];
        const bin = children.find((root: any) => ['bin', 'trash'].includes(String(root.title).toLowerCase()));
        const bar = children.find((root: any) => ['bookmarks bar', 'bookmarks toolbar', 'favourites bar', 'favorites bar'].includes(String(root.title).toLowerCase()))
          || children.find((root: any) => root.id === '1');
        resolve({ binId: bin?.id || null, barId: bar?.id || null });
      });
    }));
    expect(roots.binId, 'Opera must expose its Bin through the bookmark API for this compatibility check').toBeTruthy();
    expect(roots.barId).toBeTruthy();

    const folder = await createFolder(opera, roots.barId!, 'Opera Bin restore');
    const nested = await createFolder(opera, folder, 'Nested restore');
    const url = `https://example.test/opera-bin-restore/${crypto.randomUUID()}`;
    const bookmark = await createBookmark(opera, nested, 'Restored child', url);
    expect(await sendFromPopup(opera, { action: 'syncNow' })).toMatchObject({ success: true });
    expect(await sendFromPopup(other, { action: 'syncDown' })).toMatchObject({ success: true });
    expect(await findLocalByUrl(other, url)).toHaveLength(1);

    const queuedBeforeDelete = (await getStorage(opera)).changes.length;
    await inBackground(opera, (id: string) => new Promise<void>((resolve, reject) => chrome.bookmarks.removeTree(id, () => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve();
    })), folder);
    await waitFor(() => getStorage(opera!), state => state.changes.length > queuedBeforeDelete);
    expect(await sendFromPopup(opera, { action: 'syncNow' })).toMatchObject({ success: true });
    expect(await serverUrls(account, (await getStorage(opera)).deviceId)).not.toContain(url);
    expect(await sendFromPopup(other, { action: 'syncDown' })).toMatchObject({ success: true });
    await waitFor(() => findLocalByUrl(other!, url), matches => matches.length === 0);

    await inBackground(opera, (p: any) => new Promise<void>((resolve, reject) => chrome.bookmarks.move(p.id, { parentId: p.parentId, index: 0 }, () => {
      const error = chrome.runtime.lastError;
      error ? reject(new Error(error.message)) : resolve();
    })), { id: folder, parentId: roots.barId });
    const queued = await waitFor(() => getStorage(opera!), state => state.changes.filter((change: any) => change.type === 'CREATE').length >= 3);
    expect(queued.changes.filter((change: any) => change.type === 'CREATE').map((change: any) => change.data.browserId))
      .toEqual(expect.arrayContaining([folder, nested, bookmark]));

    const restoredPush = await sendFromPopup<any>(opera, { action: 'syncNow' });
    expect(restoredPush, JSON.stringify(restoredPush)).toMatchObject({ success: true });
    expect(await serverUrls(account, (await getStorage(opera)).deviceId)).toContain(url);
    expect(await sendFromPopup(other, { action: 'syncDown' })).toMatchObject({ success: true });
    const restored = await waitFor(() => findLocalByUrl(other!, url), matches => matches.length === 1);
    expect(restored[0].title).toBe('Restored child');
    expect(restored[0].parentId).not.toBe(roots.barId);
  } finally {
    await retirePeer(opera, account);
    await retirePeer(other, null);
  }
});
