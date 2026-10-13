import { test, expect } from '@playwright/test';
import { registerFreeUser } from './_fixtures';
import { launchPeer, seedAuth, sendFromPopup, createFolder, createBookmark, findLocalByUrl,
  inBackground, getStorage, retirePeer, waitFor, type Engine, type Peer } from './_peers';

declare const chrome: any;

for (const engine of ['msedge', 'brave', 'opera', 'helium'] as Engine[]) {
  test(`real ${engine}: nested duplicates, remote rename/move, and recursive delete converge`, async () => {
    test.setTimeout(180000);
    const account = await registerFreeUser();
    let a: Peer | null = null, b: Peer | null = null;
    try {
      a = await launchPeer(`matrix-a-${engine}`);
      b = await launchPeer(`matrix-b-${engine}`, engine);
      await seedAuth(a, account); await seedAuth(b, account);
      const folder = await createFolder(a, '1', `Matrix ${engine}`);
      const nested = await createFolder(a, folder, 'Nested ü & <tags>');
      const url = `https://example.test/${crypto.randomUUID()}/Case?b=2&a=A`;
      await createBookmark(a, nested, 'First duplicate', url);
      await createBookmark(a, nested, 'Second duplicate', url);
      const up = await sendFromPopup<any>(a, { action: 'syncNow' });
      expect(up, JSON.stringify(up)).toMatchObject({ success: true });
      const down = await sendFromPopup<any>(b, { action: 'syncDown' });
      expect(down, JSON.stringify(down)).toMatchObject({ success: true });
      const copies = await findLocalByUrl(b, url);
      expect(copies).toHaveLength(2);
      expect(new Set(copies.map(c => c.parentId)).size).toBe(1);
      expect(copies[0].parentId).not.toBe('1');
      const before = (await getStorage(b)).changes.length;
      await inBackground(b, async (id: string) => {
        await new Promise<void>((resolve, reject) => chrome.bookmarks.update(id, { title: 'Renamed from another browser' }, () => {
          chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve();
        }));
        await new Promise<void>((resolve, reject) => chrome.bookmarks.move(id, { parentId: '1', index: 0 }, () => {
          chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve();
        }));
      }, copies[0].id);
      expect((await waitFor(() => getStorage(b!), state => state.changes.length >= before + 2)).changes.length).toBeGreaterThanOrEqual(before + 2);
      const back = await sendFromPopup<any>(b, { action: 'syncNow' });
      expect(back, JSON.stringify(back)).toMatchObject({ success: true });
      expect(await sendFromPopup(a, { action: 'syncDown' })).toMatchObject({ success: true });
      const onA = await findLocalByUrl(a, url);
      expect(onA).toHaveLength(2);
      expect(onA.find(item => item.title === 'Renamed from another browser')?.parentId).toBe('1');
      const beforeDelete = (await getStorage(a)).changes.length;
      await inBackground(a, (id: string) => new Promise<void>((resolve, reject) => chrome.bookmarks.removeTree(id, () => {
        chrome.runtime.lastError ? reject(new Error(chrome.runtime.lastError.message)) : resolve();
      })), folder);
      await waitFor(() => getStorage(a!), state => state.changes.length > beforeDelete);
      expect(await sendFromPopup(a, { action: 'syncNow' })).toMatchObject({ success: true });
      expect(await sendFromPopup(b, { action: 'syncDown' })).toMatchObject({ success: true });
      expect(await findLocalByUrl(b, url)).toMatchObject([{ title: 'Renamed from another browser', parentId: '1' }]);
      // Repeat pull: it must neither duplicate the survivor nor recreate the deleted subtree.
      expect(await sendFromPopup(b, { action: 'syncDown' })).toMatchObject({ success: true });
      expect(await findLocalByUrl(b, url)).toHaveLength(1);
    } finally { await retirePeer(a, null); await retirePeer(b, account); }
  });
}
